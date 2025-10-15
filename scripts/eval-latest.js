#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

// Resolve defaults
const pkgCwd = process.cwd()
const trainingRoot = process.env.NDBG_TRAINING_ROOT
  ? path.resolve(pkgCwd, process.env.NDBG_TRAINING_ROOT)
  : path.resolve(pkgCwd, 'training')
const defaultModel = path.resolve(pkgCwd, 'ai', 'models', 'latest')

// Find latest dataset folder across roots
function findLatestDataset(root) {
  const candidates = []
  if (!fs.existsSync(root)) return null
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const full = path.join(root, d.name)
    try {
      const files = fs.readdirSync(full)
      const hasData = files.includes('manifest.json') || files.some((f) => f.endsWith('.jsonl'))
      if (!hasData) continue
      const mtime = fs.statSync(full).mtimeMs
      candidates.push({ full, mtime })
    } catch {}
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.mtime - a.mtime)
  return candidates[0].full
}

// Parse CLI args to allow overrides
const args = process.argv.slice(2)
function readArg(name) {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return undefined
}

let dataDir = readArg('--data') || findLatestDataset(trainingRoot)
if (!dataDir) fail(`No dataset found under: ${trainingRoot}`)

let modelDir = readArg('--model') || defaultModel

console.log(`Evaluating model: ${modelDir}`)
console.log(`Using dataset: ${dataDir}`)

// Build pass-through args, but remove any existing --data/--model to avoid duplication
const passThrough = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--data' || a === '--model') {
    i++
    continue
  }
  passThrough.push(a)
}

const result = spawnSync(
  'node',
  ['dist/ai/src/training/eval.js', '--data', dataDir, '--model', modelDir, ...passThrough],
  { stdio: 'inherit', cwd: pkgCwd, env: process.env }
)

process.exit(result.status ?? 1)
