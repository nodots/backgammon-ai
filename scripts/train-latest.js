#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

// Resolve a single canonical training root via env or default to packages/ai/training
const trainingRoot = process.env.NDBG_TRAINING_ROOT
  ? path.resolve(process.cwd(), process.env.NDBG_TRAINING_ROOT)
  : path.resolve(process.cwd(), 'training')

// Collect candidate subdirectories from all known roots and pick the most recent
const candidates = []
if (!fs.existsSync(trainingRoot)) fail(`Training root not found: ${trainingRoot}`)
for (const d of fs.readdirSync(trainingRoot, { withFileTypes: true })) {
  if (!d.isDirectory()) continue
  const full = path.join(trainingRoot, d.name)
  try {
    const files = fs.readdirSync(full)
    const hasData = files.includes('manifest.json') || files.some((f) => f.endsWith('.jsonl'))
    if (!hasData) continue
    const mtime = fs.statSync(full).mtimeMs
    candidates.push({ name: d.name, full, mtime })
  } catch {}
}

if (candidates.length === 0) fail(`No training datasets found under: ${trainingRoot}`)

candidates.sort((a, b) => b.mtime - a.mtime)
const latestDir = candidates[0].full
console.log(`Using latest training data: ${latestDir}`)

// Forward any extra args (e.g., --limit N)
const extraArgs = process.argv.slice(2)

const result = spawnSync(
  'node',
  ['dist/ai/src/training/train.js', '--data', latestDir, ...extraArgs],
  { stdio: 'inherit', cwd: process.cwd(), env: process.env }
)

process.exit(result.status ?? 1)
