/**
 * GNU Backgammon AI Provider
 *
 * Implements the RobotAIProvider interface using GNU Backgammon's
 * world-class analysis engine for gbg-bot, and the nodots heuristic
 * model (opening book + strategic heuristics) for all other robots.
 */

import type {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonPlayMoving,
  BackgammonMoveReady,
} from '@nodots-llc/backgammon-types'
import type { RobotAIProvider } from '@nodots-llc/backgammon-core'
import { executeRobotTurnWithGNU } from './robotExecution.js'

// Known gbg-bot user IDs (must match moveSelection.ts)
const KNOWN_GBG_BOT_IDS = new Set<string>([
  'da7eac85-cf8f-49f4-b97d-9f40d3171b36',
])

function isGbgBot(userId?: string): boolean {
  return !!userId && KNOWN_GBG_BOT_IDS.has(userId)
}

/**
 * GNUAIProvider
 *
 * Routes robot turn execution based on robot identity:
 * - gbg-bot: GNU Backgammon neural network evaluation
 * - All others: nodots heuristic model (opening book + strategic heuristics)
 *
 * @example
 * ```typescript
 * import { RobotAIRegistry } from '@nodots-llc/backgammon-core'
 * import { GNUAIProvider } from '@nodots-llc/backgammon-ai'
 *
 * RobotAIRegistry.register(new GNUAIProvider())
 * ```
 */
export class GNUAIProvider implements RobotAIProvider {
  /**
   * Execute a complete robot turn.
   * gbg-bot uses GNU Backgammon hints; all other robots use heuristic selection.
   */
  async executeRobotTurn(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `GNUAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`
      )
    }

    const userId = (game.activePlayer as any).userId as string | undefined

    if (isGbgBot(userId)) {
      return executeRobotTurnWithGNU(game)
    }

    // Non-gbg robots: use selectBestMove (nodots heuristic) iteratively
    return this.executeRobotTurnWithHeuristic(game)
  }

  /**
   * Execute a full robot turn using selectBestMove in a loop.
   * Each iteration picks the best heuristic move and executes it
   * via Game.executeAndRecalculate until no ready moves remain.
   */
  private async executeRobotTurnWithHeuristic(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    // Lazy import to avoid circular dependency
    const Core = await import('@nodots-llc/backgammon-core')
    const { selectBestMove } = await import('./moveSelection.js')

    let workingGame: any = game
    let guard = 8

    while (guard-- > 0 && workingGame.stateKind === 'moving') {
      const moves = (workingGame.activePlay?.moves || []) as any[]
      const ready = moves.filter((m: any) => m.stateKind === 'ready')

      if (ready.length === 0) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      // Use the nodots heuristic to select the best move
      const play = workingGame.activePlay
      const userId = (workingGame.activePlayer as any)?.userId
      const bestMove = await selectBestMove(play, userId)

      if (!bestMove) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      // Find the origin container ID from the selected move's possibleMoves
      const possibleMoves = bestMove.possibleMoves || []
      const firstPossible = possibleMoves[0]
      const originId = firstPossible?.origin?.id

      if (!originId) {
        workingGame = Core.Game.checkAndCompleteTurn(workingGame)
        break
      }

      workingGame = Core.Game.executeAndRecalculate(workingGame, originId)

      if (workingGame.stateKind === 'completed') break
    }

    // Transition from 'moved' to 'rolling' for the next player
    if (workingGame.stateKind === 'moved') {
      const Core = await import('@nodots-llc/backgammon-core')
      workingGame = Core.Game.handleRobotMovedState(workingGame)
    }

    return workingGame as BackgammonGameRolling
  }

  async selectBestMove(
    play: BackgammonPlayMoving,
    playerUserId?: string
  ): Promise<BackgammonMoveReady | undefined> {
    const { selectBestMove } = await import('./moveSelection.js')
    return selectBestMove(play, playerUserId)
  }
}
