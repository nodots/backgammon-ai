#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { trainFrequencyModelFromJsonlDir, savePolicyModel } from './policyModel.js'

function usage() {
  console.log('Usage: node dist/ai/src/training/train.js --data <dir> [--limit N]')
}

async function main() {
  const args = process.argv.slice(2)
  const dataDir = readArg('--data', args) || process.env.NDBG_DATA_DIR
  const limitStr = readArg('--limit', args)
  const limit = limitStr ? parseInt(limitStr, 10) : undefined
  if (!dataDir) { usage(); process.exit(1) }

  const absData = path.resolve(process.cwd(), dataDir)
  console.log(`Training frequency policy from ${absData}${limit ? ` (limit ${limit})` : ''}`)
  const model = await trainFrequencyModelFromJsonlDir({ inputDir: absData, limit })

  // Resolve models directory relative to the package root (stable regardless of CWD)
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const pkgRoot = path.resolve(__dirname, '../../../..')
  const outDir = path.join(pkgRoot, 'ai', 'models', makeVersionTag())
  const file = savePolicyModel(model, outDir)
  console.log(`Model saved: ${file}`)

  // Write training manifest for traceability
  try {
    const manifest = {
      kind: 'training-manifest',
      modelKind: 'frequency-policy-v1',
      createdAt: new Date().toISOString(),
      dataDir: absData,
      limit: typeof limit === 'number' ? limit : null,
      outDir,
    }
    fs.writeFileSync(path.join(outDir, 'training-manifest.json'), JSON.stringify(manifest, null, 2))
  } catch {}
}

function makeVersionTag(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `NODOTS_AI_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

function readArg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return undefined
}

main().catch((e) => { console.error(e); process.exit(1) })
