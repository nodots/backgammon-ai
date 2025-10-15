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
   - export NDBG_TRAINING_ROOT=packages/ai/training
   - ndbg collect --games 200  # writes to $NDBG_TRAINING_ROOT/NDBG-AI-YYYYMMDDhhmmss
3) Train a baseline policy:
   - Fastest: (cd packages/ai && npm run train:latest)
   - Or specify a dataset: node packages/ai/dist/ai/src/training/train.js --data game-logs/training/quick-start
4) Promote newest model to latest:
   - (cd packages/ai && npm run promote)
   - Note: If you trained from the repo root using the direct node path, this still works — it searches both `packages/ai/ai/models` and top-level `ai/models` and promotes the newest.
5) Evaluate:
   - Fastest: (cd packages/ai && npm run eval)  # uses newest dataset + ai/models/latest
   - Or specify a model: (cd packages/ai && npm run eval -- --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm)
   - Or run directly: node packages/ai/dist/ai/src/training/eval.js --data game-logs/training/quick-start --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
6) Use the model in play:
   - export NDBG_MODEL_DIR=packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
   - nbg-bot will use the trained policy automatically when available.

Data Collection
- Command: `ndbg collect --games <N> [--out <root>] [--shard-size <K>]`
  - Runs fast robot vs robot games fully in-process
  - Labels each moving position via GNU BG (best move)
  - Streams samples to JSONL + CSV shards; writes a manifest.json and deduplicates by featureHash
- Output directory:
  - Defaults to `packages/ai/training` (or `$NDBG_TRAINING_ROOT` if set)
  - When the output equals the training root, a timestamped subfolder `NDBG-AI-YYYYMMDDhhmmss` is created
  - You can still pass a specific directory path to write directly there
- Examples:
  - ndbg collect --games 1000
  - ndbg collect --games 1000 --out packages/ai/training  # creates a timestamped subfolder
  - ndbg collect --games 1000 --out packages/ai/training/nightly --shard-size 200000
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
- Train using the newest dataset automatically:
  - (cd packages/ai && npm run train:latest)
- Parametric baseline (better generalization):
  - (cd packages/ai && npm run train:linear)  # trains a simple linear (softmax) policy
- Or train from a specific dataset directory:
  - node packages/ai/dist/ai/src/training/train.js --data game-logs/training/2025-10-15
- Output
  - Model saved to `packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm/model.json`
  - After the next build, training always writes here regardless of your CWD.
  - Promote the newest model to `packages/ai/ai/models/latest`:
    - (cd packages/ai && npm run promote)
  - Training manifest saved as `training-manifest.json` next to `model.json` with dataset and hyperparameters for reproducibility

Evaluation & Gating
- Evaluate top‑1 agreement with GNU BG on a dataset:
  - Newest dataset + latest model: (cd packages/ai && npm run eval)
  - Newest dataset + specific model: (cd packages/ai && npm run eval -- --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm)
  - Specific dataset + specific model: node packages/ai/dist/ai/src/training/eval.js --data game-logs/training/2025-10-15 --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm
- Outputs:
  - metrics.json: { total, correct, predicted, accuracy, coverage }
    - total: samples evaluated (with a teacher label)
    - predicted: samples where the model had a prediction (feature seen in training)
    - accuracy: correct/total
    - coverage: predicted/total (how often the model had a prediction)
    - dataDir: absolute path to the evaluated dataset directory
  - REPORT.md: human summary of agreement and coverage
- Interpreting accuracy
  - 0.60+ (60%) is a good early target. Raise threshold as the model improves.
  - Use a held‑out dataset for unbiased evaluation when possible.

All‑in‑One Pipeline
- One command to collect, train, promote, and evaluate:
  - (cd packages/ai && npm run ai:full)
- Options (pass after `--`):
  - `--games <N>`: number of games for each of train and eval collections (default 200)
  - `--limit-train <N>`: training sample limit (optional)
  - `--limit-eval <N>`: eval sample limit (optional)
  - `--shard-size <K>`: samples per shard (default 100000)
  - `--model linear` to train the parametric baseline instead of the frequency lookup
  - `--eval-benchmark <name>` to evaluate on a frozen benchmark at `packages/ai/training/benchmarks/<name>` instead of collecting a fresh eval set
- The pipeline writes datasets under `$NDBG_TRAINING_ROOT` (defaults to `packages/ai/training`).
 - After eval, it appends results to `packages/ai/ai/metrics/history.jsonl` and updates `packages/ai/ai/metrics/LEADERBOARD.md`.

Benchmarks
- Place fixed, curated datasets under `packages/ai/training/benchmarks/<name>`
  - Each `<name>` directory should contain `manifest.json` or one or more `*.jsonl` shards
- Evaluate latest model across all benchmarks and record results:
  - `(cd packages/ai && npm run benchmarks)`
  - Options: `--limit <N>` to limit evaluated samples per benchmark
- Outputs:
  - Appends each benchmark’s metrics to `ai/metrics/history.jsonl`
  - Writes a summary table to `ai/metrics/BENCHMARKS.md`

Create a frozen benchmark dataset
- Quick command to collect and freeze into a named benchmark:
  - `(cd packages/ai && npm run freeze:benchmark -- --name b1 --games 5000)`
  - Options: `--shard-size <K>` (default 200000), `--overwrite` to replace an existing benchmark
- Internals:
  - Collects a fresh dataset under `$NDBG_TRAINING_ROOT`, then copies it to `packages/ai/training/benchmarks/<name>`

Using the Trained Model (nbg-bot)
- nbg-bot checks these paths for a trained policy:
  - $NDBG_MODEL_DIR/model.json (set this env var), or
  - packages/ai/ai/models/latest/model.json
- If found, it uses the policy to pick moves. Otherwise, it falls back to heuristics/opening book.
- To test quickly, export NDBG_MODEL_DIR to your model directory before running simulations.

CI Automation
- Set training root for all jobs (recommended):
  - `export NDBG_TRAINING_ROOT=packages/ai/training`
- Smoke (hosted): uses the bundled tiny dataset `game-logs/training/demo-smoke`
  - Example job:
    ```yaml
    jobs:
      ai-smoke:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 20 }
          - name: Set training root
            run: echo "NDBG_TRAINING_ROOT=packages/ai/training" >> $GITHUB_ENV
          - name: Build AI
            run: |
              cd packages/ai
              npm ci
              npm run build
          - name: Train on demo dataset
            run: |
              # Ensure demo dataset is the newest
              mkdir -p packages/ai/training && touch packages/ai/training/demo-smoke
              cd packages/ai
              npm run train:latest -- --limit 500
          - name: Promote and Eval
            run: |
              cd packages/ai
              npm run promote
              npm run eval -- --limit 2000
    ```
- Full (self-hosted): requires `@nodots-llc/gnubg-hints` available
  - Example outline:
    ```yaml
    jobs:
      ai-full:
        runs-on: self-hosted
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 20 }
          - name: Set training root
            run: echo "NDBG_TRAINING_ROOT=packages/ai/training" >> $GITHUB_ENV
          - name: Collect dataset
            run: |
              ndbg collect --games 5000 \
                --out $NDBG_TRAINING_ROOT/${{ github.run_id }} \
                --shard-size 200000
          - name: Build, Train, Promote, Eval
            run: |
              cd packages/ai
              npm ci
              npm run build
              npm run train:latest
              npm run promote
              npm run eval -- --limit 50000
          - name: Gate on accuracy >= 60%
            run: |
              ACC=$(node -e "const m=require('fs').readFileSync('packages/ai/ai/models/latest/metrics.json','utf-8'); console.log(JSON.parse(m).accuracy)")
              python - << 'PY'
              import os,sys
              acc=float(os.environ['ACC'])
              assert acc>=0.60, f"Accuracy gate failed: {acc:.2%} < 60%"
              PY
    ```

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
- Collect: `ndbg collect --games 1000`  (auto-creates `packages/ai/training/NDBG-AI-YYYYMMDDhhmmss`)
- Train (newest dataset): `(cd packages/ai && npm run train:latest)`
- Train (specific dataset): `node packages/ai/dist/ai/src/training/train.js --data packages/ai/training/DATE`
- Promote: `(cd packages/ai && npm run promote)`
- Eval (newest + latest): `(cd packages/ai && npm run eval)`
- Eval (specific): `node packages/ai/dist/ai/src/training/eval.js --data packages/ai/training/DATE --model packages/ai/ai/models/NODOTS_AI_YYYYMMDD_hhmm`
- Pipeline (full cycle): `(cd packages/ai && npm run ai:full -- --games 500)`
- Record metrics manually for a given eval:
  - `(cd packages/ai && node scripts/record-metrics.js --model ai/models/latest --data packages/ai/training/DATE)`
