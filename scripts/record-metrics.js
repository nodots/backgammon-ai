#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function fail(msg) { console.error(msg); process.exit(1) }

const args = process.argv.slice(2)
function readArg(name) {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return undefined
}

const modelDir = readArg('--model') || path.join(process.cwd(), 'ai', 'models', 'latest')
const dataDir = readArg('--data')
const tag = path.basename(modelDir) === 'latest' ? detectModelTag(modelDir) : path.basename(modelDir)

const metricsPath = path.join(modelDir, 'metrics.json')
if (!fs.existsSync(metricsPath)) fail(`metrics.json not found at: ${metricsPath}`)

const m = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
const now = new Date().toISOString()
const record = {
  timestamp: now,
  modelTag: tag,
  modelDir: path.resolve(modelDir),
  dataDir: dataDir ? path.resolve(dataDir) : undefined,
  total: m.total,
  predicted: m.predicted ?? null,
  correct: m.correct,
  accuracy: m.accuracy,
  coverage: m.coverage ?? null,
}

const outRoot = path.join(process.cwd(), 'ai', 'metrics')
fs.mkdirSync(outRoot, { recursive: true })
const historyFile = path.join(outRoot, 'history.jsonl')
fs.appendFileSync(historyFile, JSON.stringify(record) + '\n')

// Update leaderboard (top by accuracy)
try {
  const lines = fs.readFileSync(historyFile, 'utf-8').trim().split('\n').filter(Boolean)
  const rows = lines.map((l) => JSON.parse(l))
  rows.sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
  const top = rows.slice(0, 20)
  const md = [
    '# Leaderboard',
    '',
    '| Rank | Model | Accuracy | Coverage | Samples | Date |',
    '| ---- | ----- | -------- | -------- | ------- | ---- |',
    ...top.map((r, i) => {
      const acc = ((r.accuracy ?? 0) * 100).toFixed(2) + '%'
      const cov = r.coverage != null ? ((r.coverage ?? 0) * 100).toFixed(2) + '%' : '—'
      const samples = r.total ?? '—'
      const date = (r.timestamp || '').replace('T', ' ').replace('Z', '')
      return `| ${i + 1} | ${r.modelTag} | ${acc} | ${cov} | ${samples} | ${date} |`
    }),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(outRoot, 'LEADERBOARD.md'), md)
} catch {}

console.log(`[metrics] Recorded metrics for ${record.modelTag} from ${record.dataDir || '(unknown dataset)'} at ${historyFile}`)

function detectModelTag(latestDir) {
  try {
    const parent = path.dirname(latestDir)
    const entries = fs.readdirSync(parent, { withFileTypes: true })
    // Exclude latest itself and non-dirs
    const candidates = entries
      .filter((d) => d.isDirectory() && d.name !== 'latest')
      .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(parent, d.name)).mtimeMs }))
    if (candidates.length === 0) return 'latest'
    candidates.sort((a, b) => a.name.localeCompare(b.name) || a.mtime - b.mtime)
    return candidates[candidates.length - 1].name
  } catch { return 'latest' }
}

