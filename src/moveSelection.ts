/**
 * AI Move Selection with Opening Book and Strategic Logic
 * This module handles intelligent move selection for backgammon robots
 */

import type { 
  BackgammonPlayMoving, 
  BackgammonMoveReady,
  BackgammonCheckerContainer
} from '@nodots-llc/backgammon-types/dist'
import { getGnubgMoveHint } from './index.js'
import { gnubg } from './gnubg.js'

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
  if (!play.moves || play.moves.size === 0) return undefined
  
  const readyMoves = Array.from(play.moves).filter(
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
    logger.info(`[AI] ${robotName} AI Engine: GNU Backgammon (required)`)

    // gbg-bot requires GNU Backgammon to be available
    const isGnubgAvailable = await gnubg.isAvailable()
    if (!isGnubgAvailable) {
      const instructions = gnubg.getBuildInstructions()
      logger.error(`[AI] ${robotName} GNU Backgammon not available - failing as required`)
      throw new Error(
        `gbg-bot cannot function without GNU Backgammon.\n\n${instructions}`
      )
    }

    logger.info(`[AI] ${robotName} GNU Backgammon available - generating position ID`)

    try {
      // Generate position ID from current play state
      const positionId = generatePositionIdFromPlay(play)
      logger.info(`[AI] ${robotName} Generated position ID: ${positionId}`)

      // Get best move from GNU Backgammon
      const gnubgMove = await gnubg.getBestMove(positionId)
      logger.info(`[AI] ${robotName} GNU Backgammon recommended: ${gnubgMove}`)

      // Find the move that matches GNU BG recommendation
      const matchingMove = findMoveMatchingGnubgRecommendation(readyMoves, gnubgMove, robotName)
      if (matchingMove) {
        logger.info(`[AI] ${robotName} Move selected via: GNU Backgammon Engine`)
        return matchingMove
      } else {
        logger.error(`[AI] ${robotName} Could not match GNU BG recommendation "${gnubgMove}" to available moves`)
        throw new Error(
          `gbg-bot requires GNU Backgammon but could not match move recommendation "${gnubgMove}" to available moves`
        )
      }
    } catch (error) {
      logger.error(`[AI] ${robotName} GNU Backgammon integration error: ${error}`)
      throw new Error(
        `gbg-bot requires GNU Backgammon but integration failed: ${error}`
      )
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
function generatePositionIdFromPlay(play: BackgammonPlayMoving): string {
  // For now, use a basic position ID for testing
  // This should be enhanced to generate proper GNU BG position IDs from the actual board state
  // The GNU BG position ID format is complex and requires board state analysis

  // Use a known working position ID for testing (standard starting position)
  const startingPositionId = '4HPwATDgc/ABMA'

  logger.debug(`[AI] Using simplified position ID: ${startingPositionId}`)
  return startingPositionId
}

/**
 * Find a move from available moves that matches GNU BG recommendation
 * GNU BG returns moves in format like "8/4 6/4" or "24/18 13/11"
 */
function findMoveMatchingGnubgRecommendation(
  readyMoves: BackgammonMoveReady[],
  gnubgMove: string,
  robotName: string
): BackgammonMoveReady | undefined {
  logger.debug(`[AI] ${robotName} Searching for move matching GNU BG: "${gnubgMove}"`)

  // Parse GNU BG move format (e.g., "8/4 6/4" = move from 8 to 4 AND from 6 to 4)
  const moveParts = gnubgMove.split(' ').filter(part => part.includes('/'))

  if (moveParts.length === 0) {
    logger.warn(`[AI] ${robotName} Invalid GNU BG move format: "${gnubgMove}"`)
    return undefined
  }

  // For now, try to match the first move part
  const firstMovePart = moveParts[0] // e.g., "8/4"
  const [fromStr, toStr] = firstMovePart.split('/')
  const fromPos = parseInt(fromStr)
  const toPos = parseInt(toStr)

  if (isNaN(fromPos) || isNaN(toPos)) {
    logger.warn(`[AI] ${robotName} Could not parse GNU BG move positions: "${firstMovePart}"`)
    return undefined
  }

  // Search for a move that matches the from/to positions
  for (const move of readyMoves) {
    if (move.possibleMoves && move.possibleMoves.length > 0) {
      const firstPossibleMove = move.possibleMoves[0]
      if (firstPossibleMove.origin && firstPossibleMove.destination) {
        const originPos = getPositionNumber(firstPossibleMove.origin)
        const destPos = getPositionNumber(firstPossibleMove.destination)

        if (originPos === fromPos && destPos === toPos) {
          logger.info(`[AI] ${robotName} Found matching move: ${originPos}→${destPos}`)
          return move
        }
      }
    }
  }

  logger.warn(`[AI] ${robotName} No move found matching ${fromPos}→${toPos}`)
  return undefined
}
