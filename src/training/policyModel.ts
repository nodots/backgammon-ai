import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { extractFeaturesFromPlay, featureHash } from './features.js'
import type { BackgammonPlayMoving, BackgammonMoveReady } from '@nodots-llc/backgammon-types'

export interface FrequencyPolicyModel {
  kind: 'frequency-policy-v1'
  version: string
  createdAt: string
  counts: Record<string, Record<string, number>> // featureHash -> stepKey -> count
  top1: Record<string, string> // featureHash -> best stepKey
}

export interface TrainOptions {
  inputDir: string
  limit?: number
}

export function stepKeyFromTeacher(sample: any): string | null {
  const first = sample?.teacher?.steps?.[0]
  if (!first) return null
  return `${first.die}:${first.from}->${first.to}`
}

export async function trainFrequencyModelFromJsonlDir(opts: TrainOptions): Promise<FrequencyPolicyModel> {
  const counts: Record<string, Record<string, number>> = Object.create(null)
  let processed = 0
  const files = fs.readdirSync(opts.inputDir).filter(f => f.endsWith('.jsonl')).sort()

  for (const file of files) {
    const full = path.join(opts.inputDir, file)
    const rl = readline.createInterface({ input: fs.createReadStream(full) })
    for await (const line of rl) {
      if (!line) continue
      try {
        const sample = JSON.parse(line)
        const fh: string | undefined = sample.featureHash
        const key = stepKeyFromTeacher(sample)
        if (!fh || !key) continue
        counts[fh] ||= Object.create(null)
        counts[fh][key] = (counts[fh][key] || 0) + 1
        processed += 1
        if (opts.limit && processed >= opts.limit) break
      } catch {}
    }
    if (opts.limit && processed >= opts.limit) break
  }

  const top1: Record<string, string> = Object.create(null)
  for (const fh of Object.keys(counts)) {
    let bestKey = ''
    let bestCount = -1
    for (const k of Object.keys(counts[fh])) {
      const c = counts[fh][k]
      if (c > bestCount) { bestCount = c; bestKey = k }
    }
    if (bestKey) top1[fh] = bestKey
  }

  return {
    kind: 'frequency-policy-v1',
    version: '0.1.0',
    createdAt: new Date().toISOString(),
    counts,
    top1,
  }
}

export function savePolicyModel(model: FrequencyPolicyModel, outDir: string): string {
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, 'model.json')
  fs.writeFileSync(file, JSON.stringify(model))
  return file
}

export function loadPolicyModel(modelDir: string): FrequencyPolicyModel {
  const file = path.join(modelDir, 'model.json')
  const raw = fs.readFileSync(file, 'utf-8')
  return JSON.parse(raw)
}

function parseStepKey(key: string): { die: number; from: string; to: string } | null {
  const m = key.match(/^(\d+):([^>]+)->(.+)$/)
  if (!m) return null
  return { die: parseInt(m[1], 10), from: m[2], to: m[3] }
}

export function selectMoveWithPolicy(
  play: BackgammonPlayMoving,
  model: FrequencyPolicyModel
): BackgammonMoveReady | undefined {
  if (!play.moves || play.moves.length === 0) return undefined
  const readyMoves = play.moves.filter((m): m is BackgammonMoveReady => m.stateKind === 'ready')
  if (readyMoves.length === 0) return undefined

  const fh = featureHash(extractFeaturesFromPlay(play))
  const key = model.top1[fh]
  if (!key) return undefined
  const target = parseStepKey(key)
  if (!target) return undefined

  // Match on first step
  for (const move of readyMoves) {
    const pm = move.possibleMoves?.[0]
    if (!pm) continue
    const from = containerKey(pm.origin)
    const to = containerKey(pm.destination)
    // die matching is approximate; actual die assignment is handled by engine
    if (from === target.from && to === target.to) return move
  }
  return undefined
}

function containerKey(container: any): string {
  if (!container) return ''
  if (container.kind === 'bar') return 'BAR'
  if (container.kind === 'off') return 'OFF'
  if (container.kind === 'point') {
    const pos = container.position
    const idx = typeof pos?.clockwise === 'number' ? pos.clockwise : (typeof pos === 'number' ? pos : 0)
    return `P${idx}`
  }
  return ''
}

