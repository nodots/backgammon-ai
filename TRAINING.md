Nodots AI Training (Phase 1: Supervised)

This guide walks you from zero to a trained AI policy using GNU Backgammon as the teacher. No ML background is required. You will:
- Collect training data locally (fast simulations) with GNU BG labels
- Train a baseline policy model
- Evaluate accuracy and promote the model
- Optionally automate via GitHub Actions (smoke + full workflows)

Sections
- Prerequisites
- Quick Start (10 minutes)
- Data Collection
- Dataset Format
- Training
- Evaluation & Gating
- Using the Trained Model
- CI Automation (Smoke + Full)
- Performance Tips
- Troubleshooting

Prerequisites
- Node.js 20+
- Install native addon: `@nodots-llc/gnubg-hints` (required ONLY for data collection)
  - Refer to its README for platform setup instructions. It’s an N-API addon wrapping GNU Backgammon’s engine.
- Enough CPU for simulations. Start small (100–500 games) and scale.

Quick Start (10 minutes)
1) Build the AI package:
   - cd packages/ai && npm run build
2) Collect a small dataset (requires gnubg-hints to be installed):
   - ndbg collect --games 200 --out game-logs/training/quick-start
3) Train a baseline policy:
   - node packages/ai/dist/ai/src/training/train.js --data game-logs/training/quick-start
4) Promote newest model to latest:
   - (cd packages/ai && npm run promote)
5) Evaluate:
   - node packages/ai/dist/ai/src/training/eval.js --data game-logs/training/quick-start --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
6) Use the model in play:
   - export NDBG_MODEL_DIR=packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
   - nbg-bot will use the trained policy automatically when available.

Data Collection
- Command: `ndbg collect --games <N> --out <dir> [--shard-size <K>]`
  - Runs fast robot vs robot games fully in-process
  - Labels each moving position via GNU BG (best move)
  - Streams samples to JSONL + CSV shards; writes a manifest.json and deduplicates by featureHash
- Example:
  - ndbg collect --games 1000 --out game-logs/training/2025-10-15 --shard-size 200000
- Outputs in the specified `--out` directory:
  - shard-00001.jsonl (one JSON per move)
  - shard-00001.csv (compact human-inspection format)
  - manifest.json (lists shards + counts; updated incrementally)

Dataset Format
- One JSON per move containing:
  - Identifiers: gameId, turnIdx, plyIdx, positionId (GNU Position ID when available)
  - Colors & dice: gnuColor, activeColor, dice
  - legalMovesCount
  - teacher: rank, equity (if available), steps = die/from/to (first step of GNU’s best move)
  - features: compact representation of the board from active perspective
    - points[24]: positive counts for active, negative for opponent
    - bar[2], off[2]
    - sideToMove, pip counts, dice, legalMovesCount
  - featureHash: stable hash for dedup
- CSV mirrors key columns for quick inspection.

Training
- Build the AI package first: `cd packages/ai && npm run build`
- Train from a dataset directory:
  - node packages/ai/dist/ai/src/training/train.js --data game-logs/training/2025-10-15
- Output
  - Model saved to `packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm/model.json`
  - Promote the newest model to `packages/ai/ai/models/latest`:
    - (cd packages/ai && npm run promote)

Evaluation & Gating
- Evaluate top‑1 agreement with GNU BG on a dataset:
  - node packages/ai/dist/ai/src/training/eval.js --data game-logs/training/2025-10-15 --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
- Outputs:
  - metrics.json: { total, correct, accuracy }
  - REPORT.md: human summary of agreement
- Interpreting accuracy
  - 0.60+ (60%) is a good early target. Raise threshold as the model improves.
  - Use a held‑out dataset for unbiased evaluation when possible.

Using the Trained Model (nbg-bot)
- nbg-bot checks these paths for a trained policy:
  - $NDBG_MODEL_DIR/model.json (set this env var), or
  - packages/ai/ai/models/latest/model.json
- If found, it uses the policy to pick moves. Otherwise, it falls back to heuristics/opening book.
- To test quickly, export NDBG_MODEL_DIR to your model directory before running simulations.

CI Automation
- Smoke (hosted runners): `.github/workflows/ai-training-smoke.yml`
  - Builds AI, creates a tiny dummy dataset, trains, evaluates, and uploads model artifacts.
  - Run via Actions → AI Training Smoke → Run workflow.
- Full (self-hosted): `.github/workflows/ai-training-full.yml`
  - Requires a self-hosted runner with @nodots-llc/gnubg-hints installed
  - Inputs: games, shardSize, threshold (top‑1)
  - Steps: collect → train → promote → eval → gate → upload artifacts
  - Run via Actions → AI Training Full → Run workflow.

Performance Tips
- Start with `--games 200` to validate end‑to‑end; scale up as needed.
- Larger shard sizes reduce file counts; smaller shards ease parallel processing.
- Dedup by featureHash is enabled in the collector (reduces near-identical positions).
- You can parallelize collection by running multiple `ndbg collect` processes writing to different output directories.

Troubleshooting
- “GNU hints unavailable”: install `@nodots-llc/gnubg-hints` and follow its platform instructions.
- “No trained policy found”: ensure `model.json` exists at `$NDBG_MODEL_DIR/model.json` or `packages/ai/ai/models/latest/model.json`.
- Type definition errors in CLI builds: run `npm install` in `packages/cli` to restore @types.
- Permission errors writing logs: ensure your `--out` directory exists and is writable.

Cheat Sheet
- Collect: `ndbg collect --games 1000 --out game-logs/training/DATE --shard-size 200000`
- Train: `node packages/ai/dist/ai/src/training/train.js --data game-logs/training/DATE`
- Promote: `(cd packages/ai && npm run promote)`
- Eval: `node packages/ai/dist/ai/src/training/eval.js --data game-logs/training/DATE --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm`
