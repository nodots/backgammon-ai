/**
 * Nodots AI Provider
 *
 * Handles non-GNU robots using opening book + strategic heuristics.
 * Registered for nbg-bot and as the fallback provider.
 */

import type {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonPlayMoving,
  BackgammonMoveReady,
} from '@nodots-llc/backgammon-types'
import type { RobotAIProvider } from '@nodots-llc/backgammon-core'

export class NodotsAIProvider implements RobotAIProvider {
  async executeRobotTurn(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `NodotsAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`
      )
    }

    const Core = await import('@nodots-llc/backgammon-core')
    const { selectBestMove } = await import('./moveSelection.js')

    let workingGame: any = game
    let guard = 8

    while (guard-- > 0 && workingGame.stateKind === 'moving') {
      const moves = Array.isArray(workingGame.activePlay?.moves)
        ? workingGame.activePlay.moves
        : Array.from(workingGame.activePlay?.moves ?? [])
      const ready = moves.filter((m: any) => m.stateKind === 'ready')

      if (ready.length === 0) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      // Refresh each ready move's possibleMoves from the CURRENT board.
      // Stored possibleMoves can be stale after prior moves in the same
      // turn changed the board. Without this refresh the AI can select
      // an origin/destination that was valid on a previous board but is
      // no longer legal, causing CORE to reject with "Invalid move".
      const play = workingGame.activePlay
      for (const rm of ready) {
        rm.possibleMoves = Core.Board.getPossibleMoves(
          workingGame.board,
          play.player,
          rm.dieValue
        )
      }

      const bestMove = await selectBestMove(play)

      if (!bestMove) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      const possibleMoves = bestMove.possibleMoves || []
      const firstPossible = possibleMoves[0]
      const originId = firstPossible?.origin?.id

      if (!originId) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      // Pass the destination and die value so planMoveExecution takes the
      // exact-mode path. Without these options it falls into the non-exact
      // branch that can throw "No legal moves available from origin X" when
      // the planner picks the wrong die first.
      workingGame = Core.Game.executeAndRecalculate(workingGame, originId, {
        desiredDestinationId: firstPossible?.destination?.id,
        expectedDieValue: bestMove.dieValue,
      })

      if (workingGame.stateKind === 'completed') break
    }

    if (workingGame.stateKind === 'moved') {
      workingGame = Core.Game.handleRobotMovedState(workingGame)
    }

    return workingGame as BackgammonGameRolling
  }

  async selectBestMove(
    play: BackgammonPlayMoving,
    _playerUserId?: string
  ): Promise<BackgammonMoveReady | undefined> {
    const { selectBestMove } = await import('./moveSelection.js')
    return selectBestMove(play)
  }
}
