/**
 * AI Move Selection with Opening Book and Strategic Logic
 * This module handles intelligent move selection for backgammon robots
 */

import type {
  BackgammonPlayMoving,
  BackgammonMoveReady,
  BackgammonMoveDirection,
} from '@nodots/backgammon-types';
import type { GnubgColor } from './hintContext.js';
import { getNormalizedPosition } from './hintContext.js';

function directionToGnuColor(dir: BackgammonMoveDirection): GnubgColor {
  return dir === 'clockwise' ? 'white' : 'black';
}
// Optional policy model support (not required for baseline build)
let selectMoveWithPolicy: ((play: BackgammonPlayMoving, model: any) => BackgammonMoveReady | undefined) | null = null
async function tryLoadPolicyModel() {
  if (selectMoveWithPolicy) return selectMoveWithPolicy
  try {
    const path = './training/' + 'policyModel.js'
    const mod = await import(path as any)
    // @ts-ignore
    selectMoveWithPolicy = mod.selectMoveWithPolicy
  } catch {
    selectMoveWithPolicy = null
  }
  return selectMoveWithPolicy
}
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger as coreLogger } from '@nodots/backgammon-core';

// Use shared logger while keeping AI prefixing for clarity.
const withAiPrefix = (msg: string) =>
  msg.startsWith('[AI]') ? msg : `[AI] ${msg}`
const logger = {
  info: (msg: string) => coreLogger.info(withAiPrefix(msg)),
  warn: (msg: string) => coreLogger.warn(withAiPrefix(msg)),
  error: (msg: string) => coreLogger.error(withAiPrefix(msg)),
  debug: (msg: string) => coreLogger.debug(withAiPrefix(msg)),
}

/**
 * Heuristic move selection: opening book -> trained policy -> strategic heuristics.
 * Used by NodotsAIProvider. GNU routing is handled by the plugin registry,
 * not by this function.
 */
export async function selectBestMove(
  play: BackgammonPlayMoving,
): Promise<BackgammonMoveReady | undefined> {
  const movesArray = Array.isArray(play.moves)
    ? play.moves
    : Array.from(play.moves ?? [])
  if (movesArray.length === 0) return undefined

  const readyMoves = (movesArray as BackgammonMoveReady[]).filter(
    (move): move is BackgammonMoveReady => move.stateKind === 'ready'
  )

  if (readyMoves.length === 0) return undefined

  const robotName = 'Nodots AI'
  logger.info(`[AI] ${robotName} starting move selection with ${readyMoves.length} available moves`)

  // Try trained policy first if available
  try {
    const modelDir = resolveModelDir();
    const modelPath = modelDir ? path.join(modelDir, 'model.json') : undefined;
    if (modelPath && fs.existsSync(modelPath)) {
      const raw = fs.readFileSync(modelPath, 'utf-8');
      const model = JSON.parse(raw);
      const policy = await tryLoadPolicyModel()
      if (policy) {
        const policyMove = policy(play, model);
        if (policyMove) {
          logger.info(`[AI] ${robotName} Move selected via: Trained Policy`);
          (policyMove as any).__source = 'policy';
          return policyMove;
        }
      }
      logger.warn(`[AI] ${robotName} Policy available but no move matched; falling back`);
    }
  } catch (err) {
    logger.warn(`[AI] ${robotName} Policy load error: ${String(err)} (falling back)`);
  }

  // Try opening book for opening positions
  const openingMove = getOpeningBookMove(readyMoves, robotName)
  if (openingMove) {
    logger.info(`[AI] ${robotName} Move selected via: Opening Book`)
    ;(openingMove as any).__source = 'opening'
    return openingMove
  }

  // Use strategic heuristics
  const strategicMove = getBestStrategicMove(readyMoves, robotName)
  if (strategicMove) {
    logger.info(`[AI] ${robotName} Move selected via: Strategic Heuristics`)
    ;(strategicMove as any).__source = 'strategic'
    return strategicMove
  }

  // Final fallback to first available move
  logger.warn(`[AI] ${robotName} Move selected via: Fallback (first available move)`)
  ;(readyMoves[0] as any).__source = 'fallback'
  return readyMoves[0]
}

/**
 * Opening book for common opening rolls
 * Returns the theoretically best move for opening positions
 */
function getOpeningBookMove(
  readyMoves: BackgammonMoveReady[],
  robotName: string
): BackgammonMoveReady | undefined {
  // Get dice values from the moves
  const diceValues = extractDiceFromMoves(readyMoves)
  if (diceValues.length !== 2) return undefined

  const [die1, die2] = diceValues.sort()
  const openingKey = `${die1}${die2}`

  // Opening book for key opening rolls
  const openingBook: Record<string, string> = {
    '56': '24/13', // Lover's Leap - best opening move for [5,6]
    '46': '24/18', // Second best alternative
    '53': '24/16', // Common opening
    '55': '24/14', // Double fives
    '66': '24/12', // Double sixes  
    '44': '24/16', // Double fours
    '33': '24/18', // Double threes
    '22': '24/20', // Double twos
    '11': '24/22', // Double ones
  }

  const preferredMove = openingBook[openingKey]
  if (!preferredMove) return undefined

  // Try to find a move that matches the opening book recommendation
  for (const move of readyMoves) {
    if (move.possibleMoves && move.possibleMoves.length > 0) {
      const firstPossibleMove = move.possibleMoves[0]
      if (firstPossibleMove.origin && firstPossibleMove.destination) {
        // Normalize to mover perspective so openings match symmetrically
        const direction = move.player?.direction as BackgammonMoveDirection | undefined
        if (!direction) {
          continue
        }
        const originPos = getNormalizedPosition(firstPossibleMove.origin as any, directionToGnuColor(direction))
        const destPos = getNormalizedPosition(firstPossibleMove.destination as any, directionToGnuColor(direction))

        if (originPos === 24 && destPos === 13 && preferredMove === '24/13') {
          logger.info(`[AI] ${robotName} Opening Book: Lover's Leap (24/13) for dice [${die1},${die2}]`)
          return move
        }
        // Add other opening book matches as needed
      }
    }
  }

  return undefined
}

/**
 * Strategic move selection using heuristics
 * Prefers moves that advance checkers furthest
 */
function getBestStrategicMove(
  readyMoves: BackgammonMoveReady[],
  robotName: string
): BackgammonMoveReady | undefined {
  // Prefer moves that advance checkers furthest
  let bestMove = readyMoves[0]
  let bestDistance = 0

  logger.debug(`[AI] ${robotName} Strategic analysis: evaluating ${readyMoves.length} moves`)

  for (const move of readyMoves) {
    if (move.possibleMoves && move.possibleMoves.length > 0) {
      const firstPossibleMove = move.possibleMoves[0]
      if (firstPossibleMove.origin && firstPossibleMove.destination) {
        // Normalize positions to the moving player's perspective so that
        // advancing always corresponds to decreasing index in directional coords
        const direction = move.player?.direction as BackgammonMoveDirection | undefined
        if (!direction) {
          continue
        }
        const originPos = getNormalizedPosition(firstPossibleMove.origin as any, directionToGnuColor(direction))
        const destPos = getNormalizedPosition(firstPossibleMove.destination as any, directionToGnuColor(direction))

        if (originPos !== null && destPos !== null) {
          const distance = originPos - destPos // Positive means advancing in normalized coordinates
          if (distance > bestDistance) {
            bestDistance = distance
            bestMove = move
            logger.debug(`[AI] ${robotName} Strategic: new best move ${originPos}→${destPos} (distance: ${distance})`)
          }
        }
      }
    }
  }

  logger.info(`[AI] ${robotName} Strategic: selected move with distance ${bestDistance}`)
  return bestMove
}

/**
 * Extract dice values from the available moves
 * Note: For doubles (e.g., [3,3]), this will return [3,3,3,3] as expected
 */
function extractDiceFromMoves(readyMoves: BackgammonMoveReady[]): number[] {
  const diceValues: number[] = []
  for (const move of readyMoves) {
    if (move.dieValue) {
      diceValues.push(move.dieValue)
    }
  }
  return diceValues
}

function resolveModelDir(): string | undefined {
  // Priority: env var -> repo-local models/latest relative to package
  const env = process.env.NDBG_MODEL_DIR
  if (env && fs.existsSync(env)) return env

  try {
    // Resolve package root from current module
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    // dist/ai/src -> dist/ai/models/latest
    const candidate = path.resolve(__dirname, '..', 'models', 'latest')
    if (fs.existsSync(candidate)) return candidate
  } catch {}

  try {
    // Try project-local ai/models/latest from cwd
    const cwdCandidate = path.resolve(process.cwd(), 'ai', 'models', 'latest')
    if (fs.existsSync(cwdCandidate)) return cwdCandidate
  } catch {}
  return undefined
}
