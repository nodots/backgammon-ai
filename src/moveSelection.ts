/**
 * AI Move Selection with Opening Book and Strategic Logic
 * This module handles intelligent move selection for backgammon robots
 */

import type {
  BackgammonPlayMoving,
  BackgammonMoveReady,
  BackgammonCheckerContainer,
  BackgammonMoveDirection,
} from '@nodots-llc/backgammon-types';
import type { MoveHint, MoveStep } from '@nodots-llc/gnubg-hints';
import type { GnubgColor } from './hintContext.js';
import {
  buildHintContextFromPlay,
  getContainerKind,
  getNormalizedPosition,
} from './hintContext.js';

// Map direction to GnubgColor for getNormalizedPosition, which reads
// position.clockwise when color is 'white' and position.counterclockwise
// when color is 'black'.
function directionToGnuColor(dir: BackgammonMoveDirection): GnubgColor {
  return dir === 'clockwise' ? 'white' : 'black';
}
import { gnubgHints } from './gnubg.js';
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
import { logger as coreLogger } from '@nodots-llc/backgammon-core';

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
 * Main AI move selection function that tries multiple strategies in order:
 * 1. GNU Backgammon AI (required for gbg-bot, optional for others)
 * 2. Opening book for common opening rolls
 * 3. Strategic heuristics
 * 4. Random selection (fallback)
 */
export async function selectBestMove(
  play: BackgammonPlayMoving,
  playerNickname?: string
): Promise<BackgammonMoveReady | undefined> {
  const movesArray = Array.isArray(play.moves)
    ? play.moves
    : Array.from(play.moves ?? [])
  if (movesArray.length === 0) return undefined

  const readyMoves = (movesArray as BackgammonMoveReady[]).filter(
    (move): move is BackgammonMoveReady => move.stateKind === 'ready'
  )
  
  if (readyMoves.length === 0) return undefined

  // Determine identity. For now, only two robots exist: gbg-bot and nbg-bot-v1.
  // Core currently passes userId here, not nickname. Hardcode detection by name or id.
  const passedIdentifier = playerNickname || ''
  const playerUserId = (play as any)?.player?.userId as string | undefined
  const isRobot = !!(play as any)?.player?.isRobot

  // Known mapping (hardcoded for current system):
  // gbg-bot userId observed in logs/tests: da7eac85-cf8f-49f4-b97d-9f40d3171b36
  const KNOWN_GBG_BOT_IDS = new Set<string>([
    'da7eac85-cf8f-49f4-b97d-9f40d3171b36',
  ])

  const isGbgBot =
    passedIdentifier === 'gbg-bot' ||
    (playerUserId ? KNOWN_GBG_BOT_IDS.has(playerUserId) : false)

  // With only two robots in the system, treat any other robot as nbg-bot-v1
  const isNbgBot =
    passedIdentifier === 'nbg-bot-v1' || (isRobot && !isGbgBot)

  // Use a friendly name in logs
  const robotName = isGbgBot ? 'gbg-bot' : isNbgBot ? 'nbg-bot-v1' : (passedIdentifier || playerUserId || 'Unknown Robot')
  logger.info(`[AI] ${robotName} starting move selection with ${readyMoves.length} available moves`)

  if (isGbgBot) {
    logger.info(`[AI] ${robotName} AI Engine: GNU Backgammon (required)`);

    const available = await gnubgHints.isAvailable();
    if (!available) {
      const instructions = gnubgHints.getBuildInstructions();
      logger.error(
        `[AI] ${robotName} GNU Backgammon hints unavailable — terminating turn selection`,
      );
      throw new Error(
        `gbg-bot cannot function without GNU Backgammon hints.\n\n${instructions}`,
      );
    }

    try {
      const { request } = buildHintContextFromPlay(play);
      logger.debug(
        `[AI] ${robotName} requesting structured hints from @nodots-llc/gnubg-hints`,
      );
      const hints = await gnubgHints.getMoveHints(request, 10);

      if (!Array.isArray(hints) || hints.length === 0) {
        throw new Error('No move hints returned by @nodots-llc/gnubg-hints');
      }

      const matched = findMoveMatchingHints(readyMoves, hints, robotName);

      if (matched) {
        const { move, hint } = matched;
        logger.info(
          `[AI] ${robotName} Move selected via: GNU Backgammon Engine (hint rank ${hint.rank})`,
        );
        ;(move as any).__source = 'gnu-hint'
        return move;
      }
      const hintSummary = hints
        .slice(0, 3)
        .map((hint) =>
          (hint.moves || [])
            .map((step) => `${step.from}:${step.to}:${step.fromContainer}->${step.toContainer}`)
            .join(',')
        )
        .filter(Boolean);
      throw new Error(
        `GNU Backgammon hints did not match any legal moves for ${robotName} (hintSample=${JSON.stringify(
          hintSummary
        )})`,
      );
    } catch (error) {
      logger.error(
        `[AI] ${robotName} GNU Backgammon integration error: ${String(error)}`,
      );
      throw new Error(
        `gbg-bot requires GNU Backgammon hints but the integration failed: ${error}`,
      );
    }
  }

  if (isNbgBot) {
    logger.info(`[AI] ${robotName} AI Engine: Nodots AI (GNU BG excluded)`)

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
      } else {
        logger.debug(`[AI] ${robotName} No trained policy found (searched: ${modelPath || 'n/a'})`);
      }
    } catch (err) {
      logger.warn(`[AI] ${robotName} Policy load error: ${String(err)} (falling back)`);
    }
  } else {
    // For other bots (not gbg-bot, not nbg-bot), indicate they use hybrid AI approach
    logger.info(`[AI] ${robotName} AI Engine: Hybrid (Opening Book + Strategic Heuristics)`)
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

/**
 * Extract position number from a checker container
 */
function getPositionNumber(container: BackgammonCheckerContainer): number | null {
  if (container.kind === 'point' && container.position && typeof container.position === 'object') {
    // Type guard to check if it's a point position object
    const position = container.position as any
    if (position.clockwise !== undefined || position.counterclockwise !== undefined) {
      // Use clockwise position as reference for now, fallback to counterclockwise
      return position.clockwise || position.counterclockwise || null
    }
  }
  return null
}

/**
 * Generate GNU Backgammon position ID from current play state
 * This creates a simplified position ID for GNU BG analysis
 */
interface NormalizedMoveStep {
  from: number;
  to: number;
  fromContainer: MoveStep['fromContainer'];
  toContainer: MoveStep['toContainer'];
}

function normalizeMoveSkeleton(
  move: BackgammonMoveReady,
  direction: BackgammonMoveDirection,
): NormalizedMoveStep[] {
  if (!move.possibleMoves || move.possibleMoves.length === 0) {
    return [];
  }

  const steps: NormalizedMoveStep[] = [];

  for (const possibleMove of move.possibleMoves) {
    const from = getNormalizedPosition(possibleMove.origin, directionToGnuColor(direction));
    const to = getNormalizedPosition(possibleMove.destination, directionToGnuColor(direction));

    if (from === null || to === null) {
      continue;
    }

    steps.push({
      from,
      to,
      fromContainer: getContainerKind(possibleMove.origin),
      toContainer: getContainerKind(possibleMove.destination),
    });
  }

  return steps;
}

function stepsMatch(hintStep: MoveStep, moveStep: NormalizedMoveStep): boolean {
  return (
    hintStep.from === moveStep.from &&
    hintStep.to === moveStep.to &&
    hintStep.fromContainer === moveStep.fromContainer &&
    hintStep.toContainer === moveStep.toContainer
  );
}

function findMoveMatchingHints(
  readyMoves: BackgammonMoveReady[],
  hints: MoveHint[],
  robotName: string,
): { move: BackgammonMoveReady; hint: MoveHint } | undefined {
  for (const hint of hints) {
    const targetStep = hint.moves[0];
    if (!targetStep) {
      continue;
    }

    for (const move of readyMoves) {
      const direction = move.player?.direction as BackgammonMoveDirection | undefined;
      if (!direction) {
        continue;
      }

      const normalizedSteps = normalizeMoveSkeleton(move, direction);
      const matchingStep = normalizedSteps.find((step) =>
        stepsMatch(targetStep, step),
      );
      if (matchingStep) {
        logger.debug(
          `[AI] ${robotName} Matched hint step ${formatHintStep(targetStep)} to move ${formatMoveStep(matchingStep)}`,
        );
        return { move, hint };
      }
    }
  }

  return undefined;
}

function formatHintStep(step: MoveStep): string {
  return `${step.from}:${step.to}:${step.fromContainer}->${step.toContainer}`;
}

function formatMoveStep(step: NormalizedMoveStep | undefined): string {
  if (!step) {
    return 'unknown-move';
  }
  return `${step.from}:${step.to}:${step.fromContainer}->${step.toContainer}`;
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
