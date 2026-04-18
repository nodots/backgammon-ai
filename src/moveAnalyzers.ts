import type { HintRequest } from '@nodots/gnubg-hints'
import { BackgammonMoveBase } from '@nodots/backgammon-types'

// Context object for analyzers, can be extended as needed
export interface MoveAnalyzerContext {
  board?: any // Replace 'any' with your board type if available
  positionId?: string
  hintRequest?: HintRequest
  [key: string]: any
}

export interface MoveAnalyzer {
  selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null>
}

/**
 * Randomly selects a move from the list.
 */
export class RandomMoveAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[]
  ): Promise<BackgammonMoveBase | null> {
    if (!moves.length) return null
    const idx = Math.floor(Math.random() * moves.length)
    return moves[idx]
  }
}

/**
 * Type guard to check if a move has an origin property.
 */
function hasOrigin(move: BackgammonMoveBase): move is BackgammonMoveBase & {
  origin: { position: { clockwise: number; counterclockwise: number } }
} {
  return (move as any).origin && (move as any).origin.position
}

/**
 * Selects the move that leaves the most checkers furthest from being borne off.
 * If origin is available, uses its position; otherwise, falls back to dieValue.
 */
export class FurthestFromOffMoveAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[]
  ): Promise<BackgammonMoveBase | null> {
    if (!moves.length) return null
    let maxScore = -Infinity
    let bestMove: BackgammonMoveBase | null = null
    for (const move of moves) {
      let score = 0
      if (hasOrigin(move)) {
        // Use the clockwise position as a proxy for distance from off
        score = move.origin.position.clockwise
      } else {
        // Fallback: use dieValue as a proxy
        score = move.dieValue
      }
      if (score > maxScore) {
        maxScore = score
        bestMove = move
      }
    }
    return bestMove
  }
}

// Template for plugin authors
export class ExamplePluginAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    // Your custom logic here
    return moves[0] || null
  }
}
