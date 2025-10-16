#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function listModelDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'latest')
    .map((d) => {
      const full = path.join(dir, d.name)
      const hasModel = fs.existsSync(path.join(full, 'model.json'))
      let mtime = 0
      try { mtime = fs.statSync(full).mtimeMs } catch {}
      return { name: d.name, full, base: dir, hasModel, mtime }
    })
    .filter((d) => d.hasModel)
}

function main() {
  const cwd = process.cwd()
  const pkgModels = path.resolve(cwd, 'ai', 'models')
  const rootModels = path.resolve(cwd, '../../ai/models')

  const candidates = [...listModelDirs(pkgModels), ...listModelDirs(rootModels)]
  if (candidates.length === 0) {
    console.error('No models found in:', pkgModels, 'or', rootModels)
    process.exit(1)
  }

  // Prefer lexicographic (matches NODOTS_AI_YYYYMMDD_hhmm); fallback by mtime
  candidates.sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name)
    if (nameCmp !== 0) return nameCmp
    return a.mtime - b.mtime
  })
  const newest = candidates[candidates.length - 1]

  // Ensure destination models dir exists in package
  fs.mkdirSync(pkgModels, { recursive: true })
  const latestDest = path.join(pkgModels, 'latest')

  // Replace latest
  fs.rmSync(latestDest, { force: true, recursive: true })
  fs.cpSync(newest.full, latestDest, { recursive: true })
  console.log('Promoted', newest.name, '->', latestDest)
}

try { main() } catch (e) { console.error(e?.stack || e?.message || e); process.exit(1) }
