#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function fail(msg) { console.error(msg); process.exit(1) }

const args = process.argv.slice(2)
function readArg(name) {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return undefined
}

const pkgCwd = process.cwd()
const trainingRoot = process.env.NDBG_TRAINING_ROOT
  ? path.resolve(pkgCwd, process.env.NDBG_TRAINING_ROOT)
  : path.resolve(pkgCwd, 'training')
const benchmarksRoot = path.join(trainingRoot, 'benchmarks')
const latestModel = path.join(pkgCwd, 'ai', 'models', 'latest')
const limit = readArg('--limit')

if (!fs.existsSync(latestModel)) fail(`Latest model not found: ${latestModel}. Train and promote first.`)
if (!fs.existsSync(benchmarksRoot)) fail(`Benchmarks root not found: ${benchmarksRoot}`)

function isDatasetDir(dir) {
  try {
    const files = fs.readdirSync(dir)
    return files.includes('manifest.json') || files.some(f => f.endsWith('.jsonl'))
  } catch { return false }
}

const entries = fs.readdirSync(benchmarksRoot, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(benchmarksRoot, d.name))
  .filter(isDatasetDir)

if (entries.length === 0) fail(`No benchmark datasets found under: ${benchmarksRoot}`)

const results = []

for (const dir of entries) {
  const name = path.basename(dir)
  console.log(`[benchmarks] Evaluating on ${name} ...`)
  const evalArgs = ['dist/ai/src/training/eval.js', '--data', dir, '--model', latestModel]
  if (limit) evalArgs.push('--limit', limit)
  const r = spawnSync('node', evalArgs, { stdio: 'inherit', cwd: pkgCwd, env: process.env })
  if ((r.status ?? 1) !== 0) {
    console.error(`[benchmarks] Eval failed for ${name}`)
    continue
  }
  // Record metrics
  const rec = spawnSync('node', ['scripts/record-metrics.js', '--model', latestModel, '--data', dir], { stdio: 'inherit', cwd: pkgCwd, env: process.env })
  if ((rec.status ?? 1) !== 0) {
    console.error(`[benchmarks] Failed to record metrics for ${name}`)
  }
  // Read metrics
  try {
    const m = JSON.parse(fs.readFileSync(path.join(latestModel, 'metrics.json'), 'utf-8'))
    results.push({ name, ...m })
  } catch {}
}

// Write a summary table
try {
  const outRoot = path.join(pkgCwd, 'ai', 'metrics')
  fs.mkdirSync(outRoot, { recursive: true })
  const lines = [
    '# Benchmarks Summary',
    '',
    `Root: ${benchmarksRoot}`,
    '',
    '| Benchmark | Accuracy | Coverage | Samples |',
    '| --------- | -------- | -------- | ------- |',
    ...results.map(r => `| ${r.name} | ${(r.accuracy * 100).toFixed(2)}% | ${typeof r.coverage === 'number' ? (r.coverage * 100).toFixed(2) + '%' : '—'} | ${r.total} |`),
    '',
  ]
  fs.writeFileSync(path.join(outRoot, 'BENCHMARKS.md'), lines.join('\n'))
  console.log(`[benchmarks] Summary written to ${path.join(outRoot, 'BENCHMARKS.md')}`)
} catch {}

