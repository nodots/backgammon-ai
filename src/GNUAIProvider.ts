/**
 * GNU Backgammon AI Provider
 *
 * Implements the RobotAIProvider interface using GNU Backgammon's
 * world-class analysis engine. This provider is used for the gbg-bot
 * robot player.
 */

import type {
  BackgammonGameMoving,
  BackgammonGameRolling,
} from '@nodots-llc/backgammon-types'
import type { RobotAIProvider } from '@nodots-llc/backgammon-core'
import { executeRobotTurnWithGNU } from './robotExecution.js'

/**
 * GNUAIProvider
 *
 * Provides robot AI functionality using GNU Backgammon hints.
 * This implementation analyzes positions using GNU Backgammon's neural
 * network evaluation and executes the top-ranked move sequence.
 *
 * Features:
 * - World-class play (2000+ FIBS rating equivalent)
 * - Full support for complex positions (hitting, blocking, bearing off)
 * - Equity-based move selection
 * - Reliable move execution with validation
 *
 * @example
 * ```typescript
 * import { RobotAIRegistry } from '@nodots-llc/backgammon-core'
 * import { GNUAIProvider } from '@nodots-llc/backgammon-ai'
 *
 * // Register provider (typically done automatically on package import)
 * RobotAIRegistry.register(new GNUAIProvider())
 *
 * // Provider is now available to CORE's executeRobotTurn()
 * ```
 */
export class GNUAIProvider implements RobotAIProvider {
  /**
   * Execute a complete robot turn using GNU Backgammon analysis
   *
   * @param game - Game in moving state with robot as active player
   * @returns Promise resolving to game in rolling state for next player
   * @throws Error if the active player is not a robot
   * @throws Error if GNU Backgammon initialization fails
   * @throws Error if no hints are returned
   * @throws Error if move execution fails
   */
  async executeRobotTurn(
    game: BackgammonGameMoving
  ): Promise<BackgammonGameRolling> {
    // Validate that active player is a robot
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `GNUAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`
      )
    }

    // Delegate to GNU-specific implementation
    return executeRobotTurnWithGNU(game)
  }
}
