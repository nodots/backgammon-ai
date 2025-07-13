import { BackgammonMoveBase } from '../../types/src/move'
import { getBestMoveFromGnubg } from '../src/gnubgApi'
import { MoveAnalyzer, MoveAnalyzerContext } from '../src/moveAnalyzers'

export class GnubgMoveAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    if (!moves.length) return null
    const position = context?.positionId
    if (!position) {
      throw new Error('No positionId provided in context for GNUBG analysis')
    }
    try {
      const gnubgOutput = await getBestMoveFromGnubg(position)
      // TODO: Parse gnubgOutput to select the actual best move from the moves array
      console.log('GNUBG output:', gnubgOutput)
      // Placeholder: return the first move
      return moves[0]
    } catch (err) {
      console.error('Error calling GNUBG API:', err)
      return null
    }
  }
}

export default GnubgMoveAnalyzer
