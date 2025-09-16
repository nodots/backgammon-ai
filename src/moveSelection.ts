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

  // Log AI engine selection process
  const robotName = playerNickname || 'Unknown Robot'
  logger.info(`[AI] ${robotName} starting move selection with ${readyMoves.length} available moves`)

  // Check if this is gbg-bot - it MUST use GNU Backgammon
  const isGbgBot = playerNickname === 'gbg-bot'
  
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
    
    logger.info(`[AI] ${robotName} GNU Backgammon available - checking integration`)
    
    // TODO: Add position ID generation and GNU BG integration for gbg-bot
    // For now, gbg-bot fails until GNU BG integration is properly implemented
    logger.error(`[AI] ${robotName} GNU Backgammon integration incomplete`)
    throw new Error(
      'gbg-bot requires GNU Backgammon integration which is currently broken. ' +
      'Position ID generation and GNU BG command integration must be implemented.'
    )
  }

  // For other bots, try GNU Backgammon first if available, but don't require it
  // TODO: Add position ID generation and GNU BG integration

  // For other bots, indicate they use hybrid AI approach
  logger.info(`[AI] ${robotName} AI Engine: Hybrid (Opening Book + Strategic Heuristics)`)

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
 */
function extractDiceFromMoves(readyMoves: BackgammonMoveReady[]): number[] {
  const diceValues: number[] = []
  for (const move of readyMoves) {
    if (move.dieValue && !diceValues.includes(move.dieValue)) {
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