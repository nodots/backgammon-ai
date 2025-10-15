#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { loadPolicyModel } from './policyModel.js'

interface Sample { featureHash: string; teacher?: { steps?: any[] } }

function usage() {
  console.log('Usage: node dist/ai/src/training/eval.js --data <dir> --model <dir> [--limit N]')
}

async function main() {
  const args = process.argv.slice(2)
  const dataDir = readArg('--data', args)
  const modelDir = readArg('--model', args)
  const limitStr = readArg('--limit', args)
  const limit = limitStr ? parseInt(limitStr, 10) : undefined
  if (!dataDir || !modelDir) { usage(); process.exit(1) }

  const absData = path.resolve(process.cwd(), dataDir)
  const absModel = path.resolve(process.cwd(), modelDir)
  const model = loadPolicyModel(absModel)

  let total = 0
  let correct = 0
  const files = fs.readdirSync(absData).filter(f => f.endsWith('.jsonl')).sort()
  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(absData, file)) })
    for await (const line of rl) {
      if (!line) continue
      try {
        const sample: Sample = JSON.parse(line)
        const fh = sample.featureHash
        if (!fh) continue
        const pred = model.top1[fh]
        if (!pred) continue
        const teacherFirst = firstStepKey(sample)
        if (!teacherFirst) continue
        total += 1
        if (pred === teacherFirst) correct += 1
        if (limit && total >= limit) break
      } catch {}
    }
    if (limit && total >= limit) break
  }

  const acc = total > 0 ? correct / total : 0
  const metrics = { total, correct, accuracy: acc }
  const outDir = path.join(absModel)
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2))
  fs.writeFileSync(path.join(outDir, 'REPORT.md'), `# Evaluation\n\n- Samples: ${total}\n- Top-1 Agreement: ${(acc * 100).toFixed(2)}%\n`)
  console.log(`Top-1 agreement: ${(acc * 100).toFixed(2)}% on ${total} samples`)
}

function firstStepKey(sample: any): string | null {
  const first = sample?.teacher?.steps?.[0]
  if (!first) return null
  return `${first.die}:${first.from}->${first.to}`
}

function readArg(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name)
  if (i >= 0 && i + 1 < args.length) return args[i + 1]
  return undefined
}

main().catch((e) => { console.error(e); process.exit(1) })

