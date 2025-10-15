import type { BackgammonPlayMoving } from '@nodots-llc/backgammon-types'
import type { MoveHint } from '@nodots-llc/gnubg-hints'
import { buildHintContextFromPlay } from '../hintContext.js'
import { gnubgHints } from '../gnubg.js'
import { extractFeaturesFromPlay, featureHash, type ExtractedFeatures } from './features.js'
import fs from 'fs'
import path from 'path'

export interface MoveSample {
  // identifiers
  gameId: string
  turnIdx: number
  plyIdx: number
  positionId?: string
  gnuColor: 'white' | 'black'
  activeColor: 'white' | 'black'
  dice: [number, number]
  legalMovesCount: number
  // label (teacher)
  teacher: {
    rank: number
    equity?: number
    steps: Array<{
      die: number
      from: string
      to: string
    }>
  }
  // features
  features: ExtractedFeatures
  featureHash: string
  // outcome (optional, filled at end-of-game)
  outcome?: {
    winner?: 'white' | 'black'
    gameLength?: number
  }
}

export interface DatasetWriterOptions {
  outDir: string
  shardSize?: number // number of samples per shard
  writeCSV?: boolean
  dedupByFeatureHash?: boolean
}

export class DatasetWriter {
  private options: Required<DatasetWriterOptions>
  private shardIndex = 0
  private countInShard = 0
  private jsonlStream: fs.WriteStream | null = null
  private csvStream: fs.WriteStream | null = null
  private manifestPath: string
  private manifest: { shards: { jsonl: string; csv?: string; count: number }[]; totalSamples: number }
  private seen: Set<string> | null

  constructor(opts: DatasetWriterOptions) {
    this.options = {
      shardSize: opts.shardSize ?? 100_000,
      writeCSV: opts.writeCSV ?? true,
      outDir: opts.outDir,
      dedupByFeatureHash: opts.dedupByFeatureHash ?? false,
    }
    fs.mkdirSync(this.options.outDir, { recursive: true })
    this.manifestPath = path.join(this.options.outDir, 'manifest.json')
    this.manifest = { shards: [], totalSamples: 0 }
    this.seen = this.options.dedupByFeatureHash ? new Set() : null
    this.openNewShard()
  }

  private currentBaseName(): string {
    const idx = String(this.shardIndex).padStart(5, '0')
    return path.join(this.options.outDir, `shard-${idx}`)
  }

  private openNewShard() {
    if (this.jsonlStream) this.jsonlStream.end()
    if (this.csvStream) this.csvStream.end()
    this.shardIndex += 1
    this.countInShard = 0
    const base = this.currentBaseName()
    const jsonl = `${base}.jsonl`
    const csv = this.options.writeCSV ? `${base}.csv` : undefined
    this.jsonlStream = fs.createWriteStream(jsonl, { flags: 'w' })
    if (csv) {
      this.csvStream = fs.createWriteStream(csv, { flags: 'w' })
      this.csvStream.write(this.csvHeader() + '\n')
    }
    this.manifest.shards.push({ jsonl: path.basename(jsonl), csv: csv ? path.basename(csv) : undefined, count: 0 })
    this.flushManifest()
  }

  private csvHeader(): string {
    return [
      'gameId','turnIdx','plyIdx','positionId','gnuColor','activeColor',
      'dice1','dice2','legalMovesCount','teacherRank','teacherEquity','teacherSteps',
      'featureHash',
      // basic features snapshot (keep compact; training pipelines can parse JSONL instead for tensors)
      'points','barActive','barOpponent','offActive','offOpponent','sideToMove','activePip','opponentPip'
    ].join(',')
  }

  private sampleToCsv(sample: MoveSample): string {
    const stepsStr = sample.teacher.steps.map(s => `${s.die}:${s.from}->${s.to}`).join(';')
    const pointsStr = sample.features.points.join('|')
    return [
      sample.gameId,
      sample.turnIdx,
      sample.plyIdx,
      sample.positionId ?? '',
      sample.gnuColor,
      sample.activeColor,
      sample.dice[0],
      sample.dice[1],
      sample.legalMovesCount,
      sample.teacher.rank,
      sample.teacher.equity ?? '',
      stepsStr,
      sample.featureHash,
      pointsStr,
      sample.features.bar[0],
      sample.features.bar[1],
      sample.features.off[0],
      sample.features.off[1],
      sample.features.sideToMove,
      sample.features.activePip,
      sample.features.opponentPip,
    ].join(',')
  }

  async write(sample: MoveSample): Promise<void> {
    if (this.seen) {
      if (this.seen.has(sample.featureHash)) return
      this.seen.add(sample.featureHash)
    }
    if (!this.jsonlStream) this.openNewShard()
    this.jsonlStream!.write(JSON.stringify(sample) + '\n')
    if (this.csvStream) this.csvStream.write(this.sampleToCsv(sample) + '\n')
    this.countInShard += 1
    this.manifest.totalSamples += 1
    const current = this.manifest.shards[this.manifest.shards.length - 1]
    current.count += 1
    if (this.manifest.totalSamples % 1000 === 0) this.flushManifest()
    if (this.countInShard >= this.options.shardSize) {
      this.openNewShard()
    }
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.jsonlStream) return resolve()
      this.jsonlStream!.end(() => resolve())
    })
    if (this.csvStream) {
      await new Promise<void>((resolve) => this.csvStream!.end(() => resolve()))
    }
    this.flushManifest()
  }

  private flushManifest() {
    try { fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2)) } catch {}
  }
}

export async function buildLabeledSampleFromPlay(
  play: BackgammonPlayMoving,
  turnIdx: number,
  plyIdx: number
): Promise<MoveSample | null> {
  const { request, normalization } = buildHintContextFromPlay(play)
  const hint = await gnubgHints.getBestMove(request, 10)
  if (!hint) return null

  const features = extractFeaturesFromPlay(play)
  const fh = featureHash(features)
  const teacher = mapHintToTeacher(hint)
  const positionId = (play as any)?.game?.gnuPositionId || undefined
  const dice: [number, number] = features.dice
  const activeColor = play.player.color as 'white' | 'black'
  const gnuColor = normalization.toGnu[activeColor]

  return {
    gameId: (play as any)?.game?.id || (play as any)?.player?.gameId || 'unknown-game',
    turnIdx,
    plyIdx,
    positionId,
    gnuColor,
    activeColor,
    dice,
    legalMovesCount: features.legalMovesCount,
    teacher,
    features,
    featureHash: fh,
  }
}

function mapHintToTeacher(hint: MoveHint): MoveSample['teacher'] {
  const first = (hint.moves && hint.moves[0]) || (hint as any).steps?.[0]
  const steps = (hint.moves || (hint as any).steps || [])
  return {
    rank: (hint as any).rank ?? 1,
    equity: (hint as any).equity,
    steps: steps.map((s: any) => ({
      die: s.dieValue,
      from: containerToKey(s.fromContainer, s.fromPosition),
      to: containerToKey(s.toContainer, s.toPosition),
    })),
  }
}

function containerToKey(kind?: string, position?: any): string {
  if (!kind) return ''
  if (kind === 'point' && position) {
    const idx = typeof position.clockwise === 'number' ? position.clockwise : (typeof position === 'number' ? position : '')
    return `P${idx}`
  }
  if (kind === 'bar') return 'BAR'
  if (kind === 'off') return 'OFF'
  return kind
}
