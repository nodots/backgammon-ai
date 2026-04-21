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

/**
 * Picks a move by reading tea leaves.
 *
 * Paper 10, Section 8.4 admits tea leaves as a valid plugin. This is
 * that plugin. There is no evaluation, no heuristic, no weights. The
 * position ID (when present) is fed through a cheap string hash and
 * the remainder modulo `moves.length` picks the move — deterministic
 * per position, meaningless as backgammon. Without a position ID the
 * analyzer falls back to `Date.now()`, which is genuinely arbitrary.
 *
 * Intended as a calibration floor and a living footnote.
 */
export class TeaLeavesMoveAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    if (!moves.length) return null
    const leaves = context?.positionId ?? String(Date.now())
    let hash = 0
    for (let i = 0; i < leaves.length; i++) {
      hash = (hash * 31 + leaves.charCodeAt(i)) | 0
    }
    const idx = Math.abs(hash) % moves.length
    return moves[idx]
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
