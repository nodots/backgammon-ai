/**
 * GNU Backgammon AI Provider
 *
 * Handles all GNU-based robots using the native gnubg-hints addon.
 * Registered for gnu-* and gbg-bot email patterns.
 */

import type {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonPlayMoving,
  BackgammonMoveReady,
} from '@nodots-llc/backgammon-types'
import type { RobotAIProvider } from '@nodots-llc/backgammon-core'
import { executeRobotTurnWithGNU } from './robotExecution.js'

export class GNUAIProvider implements RobotAIProvider {
  async executeRobotTurn(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `GNUAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`
      )
    }
    return executeRobotTurnWithGNU(game)
  }

  async selectBestMove(
    play: BackgammonPlayMoving,
    _playerUserId?: string
  ): Promise<BackgammonMoveReady | undefined> {
    const { selectBestMove } = await import('./moveSelection.js')
    return selectBestMove(play)
  }
}
