#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function fail(msg) { console.error(msg); process.exit(1) }

const pkgCwd = process.cwd()
const trainingRoot = process.env.NDBG_TRAINING_ROOT
  ? path.resolve(pkgCwd, process.env.NDBG_TRAINING_ROOT)
  : path.resolve(pkgCwd, 'training')

const args = process.argv.slice(2)
function readArg(name, def) {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return def
}

const games = parseInt(readArg('--games', '200'), 10)
const shardSize = parseInt(readArg('--shard-size', '100000'), 10)
const limitTrain = readArg('--limit-train') ? parseInt(readArg('--limit-train'), 10) : undefined
const limitEval = readArg('--limit-eval') ? parseInt(readArg('--limit-eval'), 10) : undefined
const modelKind = readArg('--model') || 'frequency' // 'frequency' | 'linear'
const epochsStr = readArg('--epochs')
const maxClassesStr = readArg('--max-classes')
const lrStr = readArg('--lr')
const l2Str = readArg('--l2')
const evalBenchmark = readArg('--eval-benchmark')

function run(cmd, argv, opts={}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', cwd: pkgCwd, env: process.env, ...opts })
  if ((r.status ?? 1) !== 0) fail(`Command failed: ${cmd} ${argv.join(' ')}`)
}

function findLatestDataset(root) {
  if (!fs.existsSync(root)) return null
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const candidates = []
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const full = path.join(root, d.name)
    try {
      const files = fs.readdirSync(full)
      const hasData = files.includes('manifest.json') || files.some((f) => f.endsWith('.jsonl'))
      if (!hasData) continue
      candidates.push({ full, mtime: fs.statSync(full).mtimeMs })
    } catch {}
  }
  if (candidates.length === 0) return null
  candidates.sort((a,b) => b.mtime - a.mtime)
  return candidates[0].full
}

function makeDatasetDirName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `NDBG-AI-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// 1) Collect train set
console.log(`[pipeline] Training root: ${trainingRoot}`)
fs.mkdirSync(trainingRoot, { recursive: true })
console.log(`[pipeline] Collecting train set: ${games} games ...`)
const trainSet = path.join(trainingRoot, makeDatasetDirName())
run('ndbg', ['collect', '--games', String(games), '--out', trainSet, '--shard-size', String(shardSize), '--quiet'])
if (!fs.existsSync(trainSet)) fail('No training dataset found after collection')
console.log(`[pipeline] Train dataset: ${trainSet}`)

// 2) Evaluate against benchmark or collect eval set
let evalSet
if (evalBenchmark) {
  const bm = path.join(trainingRoot, 'benchmarks', evalBenchmark)
  if (!fs.existsSync(bm)) fail(`Benchmark not found: ${bm}`)
  evalSet = bm
  console.log(`[pipeline] Using benchmark for eval: ${evalSet}`)
} else {
  console.log('[pipeline] Collecting eval set ...')
  await new Promise(r => setTimeout(r, 1100))
  evalSet = path.join(trainingRoot, makeDatasetDirName())
  run('ndbg', ['collect', '--games', String(games), '--out', evalSet, '--shard-size', String(shardSize), '--quiet'])
  if (!fs.existsSync(evalSet)) fail('No eval dataset found after second collection')
  console.log(`[pipeline] Eval dataset: ${evalSet}`)
}

// Ensure dist up to date
console.log('[pipeline] Building AI ...')
run('npm', ['run', 'build'])

// 3) Train
console.log(`[pipeline] Training model (${modelKind}) ...`)
const trainScript = modelKind === 'linear' ? 'dist/ai/src/training/train-linear.js' : 'dist/ai/src/training/train.js'
const trainArgs = [trainScript, '--data', trainSet]
if (typeof limitTrain === 'number') trainArgs.push('--limit', String(limitTrain))
if (modelKind === 'linear') {
  if (epochsStr) trainArgs.push('--epochs', epochsStr)
  if (maxClassesStr) trainArgs.push('--max-classes', maxClassesStr)
  if (lrStr) trainArgs.push('--lr', lrStr)
  if (l2Str) trainArgs.push('--l2', l2Str)
}
run('node', trainArgs)

// 4) Promote
console.log('[pipeline] Promoting latest model ...')
run('node', ['scripts/promote-latest.js'])

// 5) Eval
console.log('[pipeline] Evaluating model ...')
const evalArgs = ['dist/ai/src/training/eval.js', '--data', evalSet, '--model', path.join(pkgCwd, 'ai', 'models', 'latest')]
if (typeof limitEval === 'number') evalArgs.push('--limit', String(limitEval))
run('node', evalArgs)

// 6) Print metrics path
const metricsFile = path.join(pkgCwd, 'ai', 'models', 'latest', 'metrics.json')
if (fs.existsSync(metricsFile)) {
  const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'))
  console.log(`[pipeline] Metrics:`, metrics)
  console.log(`[pipeline] Done. Metrics at: ${metricsFile}`)
} else {
  console.log('[pipeline] Warning: metrics.json not found')
}

// 7) Record metrics to history
try {
  run('node', ['scripts/record-metrics.js', '--model', path.join(pkgCwd, 'ai', 'models', 'latest'), '--data', evalSet])
} catch {}
