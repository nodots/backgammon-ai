/**
 * AI Move Selection with Opening Book and Strategic Logic
 * This module handles intelligent move selection for backgammon robots
 */

import type {
  BackgammonPlayMoving,
  BackgammonMoveReady,
  BackgammonCheckerContainer,
} from '@nodots-llc/backgammon-types';
import type { MoveHint, MoveStep } from '@nodots-llc/gnubg-hints';
import {
  buildHintContextFromPlay,
  GnubgColorNormalization,
  getContainerKind,
  getNormalizedPosition,
} from './hintContext.js';
import { gnubgHints } from './gnubg.js';

// Simple logger to avoid circular dependency with core
const logger = {
  info: (msg: string) => console.log(`[AI] [INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[AI] [WARN] ${msg}`),
  error: (msg: string) => console.error(`[AI] [ERROR] ${msg}`),
  debug: (msg: string) => console.log(`[AI] [DEBUG] ${msg}`)
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
  if (!play.moves || play.moves.length === 0) return undefined

  const readyMoves = play.moves.filter(
    (move) => move.stateKind === 'ready'
  ) as BackgammonMoveReady[]
  
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
      const { request, normalization } = buildHintContextFromPlay(play);
      logger.debug(
        `[AI] ${robotName} requesting structured hints from @nodots-llc/gnubg-hints`,
      );
      const hints = await gnubgHints.getMoveHints(request, 10);

      if (!Array.isArray(hints) || hints.length === 0) {
        throw new Error('No move hints returned by @nodots-llc/gnubg-hints');
      }

      const matched = findMoveMatchingHints(
        readyMoves,
        hints,
        normalization,
        robotName,
      );

      if (matched) {
        const { move, hint } = matched;
        logger.info(
          `[AI] ${robotName} Move selected via: GNU Backgammon Engine (hint rank ${hint.rank})`,
        );
        return move;
      }

      logger.warn(
        `[AI] ${robotName} Structured hints received but none matched available moves; falling back to heuristics`,
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
  } else {
    // For other bots (not gbg-bot, not nbg-bot), indicate they use hybrid AI approach
    logger.info(`[AI] ${robotName} AI Engine: Hybrid (Opening Book + Strategic Heuristics)`)
  }

  // Try opening book for opening positions
  const openingMove = getOpeningBookMove(readyMoves, robotName)
  if (openingMove) {
    logger.info(`[AI] ${robotName} Move selected via: Opening Book`)
    return openingMove
  }

  // Use strategic heuristics
  const strategicMove = getBestStrategicMove(readyMoves, robotName)
  if (strategicMove) {
    logger.info(`[AI] ${robotName} Move selected via: Strategic Heuristics`)
    return strategicMove
  }

  // Final fallback to first available move
  logger.warn(`[AI] ${robotName} Move selected via: Fallback (first available move)`)
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
        // Extract position numbers for comparison
        const originPos = getPositionNumber(firstPossibleMove.origin)
        const destPos = getPositionNumber(firstPossibleMove.destination)
        
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
        const originPos = getPositionNumber(firstPossibleMove.origin)
        const destPos = getPositionNumber(firstPossibleMove.destination)
        
        if (originPos && destPos) {
          const distance = originPos - destPos // Positive means advancing
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
  normalizedColor: 'white' | 'black',
): NormalizedMoveStep[] {
  if (!move.possibleMoves || move.possibleMoves.length === 0) {
    return [];
  }

  const steps: NormalizedMoveStep[] = [];

  for (const possibleMove of move.possibleMoves) {
    const from = getNormalizedPosition(possibleMove.origin, normalizedColor);
    const to = getNormalizedPosition(possibleMove.destination, normalizedColor);

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
  normalization: GnubgColorNormalization,
  robotName: string,
): { move: BackgammonMoveReady; hint: MoveHint } | undefined {
  for (const hint of hints) {
    const targetStep = hint.moves[0];
    if (!targetStep) {
      continue;
    }

    for (const move of readyMoves) {
      const normalizedColor = normalization.toGnu[move.player.color];
      if (!normalizedColor) {
        continue;
      }

      const normalizedSteps = normalizeMoveSkeleton(move, normalizedColor);
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
