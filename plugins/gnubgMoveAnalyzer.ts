import type { BackgammonMoveBase } from '../../types/src/move'
import type { HintRequest } from '@nodots/gnubg-hints'
import { gnubgHints } from '../src/gnubg.js'
import { MoveAnalyzer, MoveAnalyzerContext } from '../src/moveAnalyzers'

export class GnubgMoveAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    if (!moves.length) {
      return null
    }

    const hintRequest: HintRequest | undefined = context?.hintRequest
    if (!hintRequest) {
      console.warn(
        '[GnubgMoveAnalyzer] context.hintRequest missing; returning first move fallback',
      )
      return moves[0]
    }

    try {
      const hints = await gnubgHints.getMoveHints(hintRequest, 1)
      if (!hints.length) {
        return moves[0]
      }
    } catch (error) {
      console.error('[GnubgMoveAnalyzer] failed to fetch hints', error)
    }

    // TODO: map structured hints to the provided moves.
    return moves[0]
  }
}

export default GnubgMoveAnalyzer
