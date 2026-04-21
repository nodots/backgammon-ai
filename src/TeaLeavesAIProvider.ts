/**
 * Tea Leaves AI Provider
 *
 * Routes robot turns through TeaLeavesMoveAnalyzer, which picks a legal
 * move by hashing the GNU position ID modulo the legal-move count.
 * Deterministic per position, strategically meaningless. Useful as a
 * calibration floor.
 */

import type {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonMoveReady,
  BackgammonPlayMoving,
} from '@nodots/backgammon-types'
import type { RobotAIProvider } from '@nodots/backgammon-core'
import { TeaLeavesMoveAnalyzer } from './moveAnalyzers.js'

export class TeaLeavesAIProvider implements RobotAIProvider {
  private analyzer = new TeaLeavesMoveAnalyzer()

  async executeRobotTurn(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `TeaLeavesAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`
      )
    }

    const Core = await import('@nodots/backgammon-core')

    let workingGame: any = game
    let guard = 8
    const telemetry: Array<Record<string, unknown>> = []

    const posFromContainer = (
      container: any,
      direction: string
    ): number | 'bar' | 'off' => {
      if (!container) return 0
      if (container.kind === 'bar') return 'bar'
      if (container.kind === 'off') return 'off'
      const pos = container.position?.[direction]
      return typeof pos === 'number' ? pos : 0
    }

    while (guard-- > 0 && workingGame.stateKind === 'moving') {
      const moves = Array.isArray(workingGame.activePlay?.moves)
        ? workingGame.activePlay.moves
        : Array.from(workingGame.activePlay?.moves ?? [])
      const ready = moves.filter((m: any) => m.stateKind === 'ready')

      if (ready.length === 0) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      const play = workingGame.activePlay
      const playerDirection = play?.player?.direction || 'clockwise'

      // Refresh each ready move's possibleMoves from the CURRENT board.
      for (const rm of ready) {
        rm.possibleMoves = Core.Board.getPossibleMoves(
          workingGame.board,
          play.player,
          rm.dieValue
        )
      }

      const bestMove = await this.pickReady(ready, workingGame)

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

      const executedFrom = posFromContainer(
        firstPossible?.origin,
        playerDirection
      )
      const executedTo = posFromContainer(
        firstPossible?.destination,
        playerDirection
      )
      const executedDieValue = bestMove.dieValue

      workingGame = Core.Game.executeAndRecalculate(workingGame, originId, {
        desiredDestinationId: firstPossible?.destination?.id,
        expectedDieValue: executedDieValue,
      })

      telemetry.push({
        executedFrom,
        executedTo,
        executedDieValue,
        executedMoveKind: (firstPossible as any)?.moveKind || 'point-to-point',
        executedIsHit: false,
        usedFallback: false,
      })

      if (workingGame.stateKind === 'completed') break
    }

    if (workingGame.stateKind === 'moved') {
      workingGame = Core.Game.handleRobotMovedState(workingGame)
    }

    const result = workingGame as BackgammonGameRolling
    Object.defineProperty(result as any, '__aiTelemetry', {
      value: telemetry,
      enumerable: false,
      configurable: true,
    })
    return result
  }

  async selectBestMove(
    play: BackgammonPlayMoving,
    _playerUserId?: string
  ): Promise<BackgammonMoveReady | undefined> {
    const moves = Array.isArray(play.moves)
      ? (play.moves as any[])
      : Array.from(play.moves as any)
    const ready = moves.filter((m) => m.stateKind === 'ready')
    if (ready.length === 0) return undefined
    const picked = await this.pickReady(ready as any, null)
    return picked as BackgammonMoveReady | undefined
  }

  // Picks a ready-move entry whose possibleMoves is non-empty. The
  // analyzer itself chooses a ready move; we then verify it has a legal
  // concrete move to execute, falling back to the next candidate if not.
  private async pickReady(
    ready: any[],
    game: any
  ): Promise<any | undefined> {
    const withPM = ready.filter(
      (m) => Array.isArray(m.possibleMoves) && m.possibleMoves.length > 0
    )
    if (withPM.length === 0) return undefined
    const positionId: string | undefined =
      game?.board?.gnuPositionId ??
      game?.gnuPositionId ??
      ready[0]?.moveHistory?.previousBoardState
    const picked = await this.analyzer.selectMove(withPM as any, {
      positionId,
    })
    return picked ?? withPM[0]
  }
}
