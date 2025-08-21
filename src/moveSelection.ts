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

/**
 * Main AI move selection function that tries multiple strategies in order:
 * 1. GNU Backgammon AI (if available)
 * 2. Opening book for common opening rolls
 * 3. Strategic heuristics
 * 4. Random selection (fallback)
 */
export async function selectBestMove(
  play: BackgammonPlayMoving
): Promise<BackgammonMoveReady | undefined> {
  if (!play.moves || play.moves.size === 0) return undefined
  
  const readyMoves = Array.from(play.moves).filter(
    (move) => move.stateKind === 'ready'
  ) as BackgammonMoveReady[]
  
  if (readyMoves.length === 0) return undefined

  // Try GNU Backgammon first (if position ID available)
  // TODO: Add position ID generation and GNU BG integration

  // Try opening book for opening positions
  const openingMove = getOpeningBookMove(readyMoves)
  if (openingMove) {
    console.log('🤖 [AI] Using opening book move')
    return openingMove
  }

  // Use strategic heuristics
  const strategicMove = getBestStrategicMove(readyMoves)
  if (strategicMove) {
    console.log('🤖 [AI] Using strategic move selection')
    return strategicMove
  }

  // Final fallback to first available move
  console.log('🤖 [AI] Using fallback (first available move)')
  return readyMoves[0]
}

/**
 * Opening book for common opening rolls
 * Returns the theoretically best move for opening positions
 */
function getOpeningBookMove(
  readyMoves: BackgammonMoveReady[]
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
          console.log(`🎯 [OpeningBook] Found Lover's Leap (24/13) for dice [${die1},${die2}]`)
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
  readyMoves: BackgammonMoveReady[]
): BackgammonMoveReady | undefined {
  // Prefer moves that advance checkers furthest
  let bestMove = readyMoves[0]
  let bestDistance = 0

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
          }
        }
      }
    }
  }

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