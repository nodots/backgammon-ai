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
const name = readArg('--name')
const games = parseInt(readArg('--games') || '5000', 10)
const shardSize = parseInt(readArg('--shard-size') || '200000', 10)
const overwrite = args.includes('--overwrite')

if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) fail('Provide a benchmark name via --name <id> (alphanumeric, dot, dash, underscore).')

const trainingRoot = process.env.NDBG_TRAINING_ROOT
  ? path.resolve(pkgCwd, process.env.NDBG_TRAINING_ROOT)
  : path.resolve(pkgCwd, 'training')
const benchmarksRoot = path.join(trainingRoot, 'benchmarks')
fs.mkdirSync(benchmarksRoot, { recursive: true })

// Snapshot existing directories to identify the new one after collection
function listDatasets(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(root, d.name))
  } catch { return [] }
}

const before = new Set(listDatasets(trainingRoot))
console.log(`[freeze] Collecting ${games} games into training root: ${trainingRoot}`)
const r = spawnSync('ndbg', ['collect', '--games', String(games), '--out', trainingRoot, '--shard-size', String(shardSize), '--quiet'], { stdio: 'inherit', cwd: pkgCwd, env: process.env })
if ((r.status ?? 1) !== 0) fail('Collection failed')

// Find newly created dataset directory
const after = listDatasets(trainingRoot)
const created = after.filter(p => !before.has(p))
if (created.length === 0) fail('No new dataset directory found after collection')
// Pick the most recently modified among created
created.sort((a,b) => (fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs))
const src = created[0]

const dst = path.join(benchmarksRoot, name)
if (fs.existsSync(dst)) {
  const isEmpty = fs.readdirSync(dst).length === 0
  if (!isEmpty && !overwrite) fail(`Destination exists and not empty: ${dst}. Use --overwrite to replace.`)
  fs.rmSync(dst, { recursive: true, force: true })
}
console.log(`[freeze] Freezing dataset ${path.basename(src)} -> ${dst}`)
fs.cpSync(src, dst, { recursive: true })
console.log(`[freeze] Done.`)

