/**
 * Luck Calculator
 *
 * Calculates how favorable dice rolls were compared to expected average.
 * Uses GNU Backgammon equity evaluations to measure luck.
 */

import type { BackgammonColor } from '@nodots-llc/backgammon-types'
import { GnuBgHints } from '@nodots-llc/gnubg-hints'

/**
 * All 21 possible dice combinations with their probabilities.
 * Doubles have probability 1/36, non-doubles have probability 2/36.
 */
const ALL_DICE_COMBINATIONS: Array<{ dice: [number, number]; probability: number }> = [
  // Doubles (1/36 each)
  { dice: [1, 1], probability: 1 / 36 },
  { dice: [2, 2], probability: 1 / 36 },
  { dice: [3, 3], probability: 1 / 36 },
  { dice: [4, 4], probability: 1 / 36 },
  { dice: [5, 5], probability: 1 / 36 },
  { dice: [6, 6], probability: 1 / 36 },
  // Non-doubles (2/36 each)
  { dice: [1, 2], probability: 2 / 36 },
  { dice: [1, 3], probability: 2 / 36 },
  { dice: [1, 4], probability: 2 / 36 },
  { dice: [1, 5], probability: 2 / 36 },
  { dice: [1, 6], probability: 2 / 36 },
  { dice: [2, 3], probability: 2 / 36 },
  { dice: [2, 4], probability: 2 / 36 },
  { dice: [2, 5], probability: 2 / 36 },
  { dice: [2, 6], probability: 2 / 36 },
  { dice: [3, 4], probability: 2 / 36 },
  { dice: [3, 5], probability: 2 / 36 },
  { dice: [3, 6], probability: 2 / 36 },
  { dice: [4, 5], probability: 2 / 36 },
  { dice: [4, 6], probability: 2 / 36 },
  { dice: [5, 6], probability: 2 / 36 },
]

// Luck thresholds for classification
const JOKER_THRESHOLD = 0.10
const ANTI_JOKER_THRESHOLD = -0.10

export interface RollLuckResult {
  positionId: string
  dice: [number, number]
  moveNumber: number
  playerId: string
  playerColor: BackgammonColor
  luck: number
  expectedEquity: number
  actualEquity: number
}

export interface PlayerLuckSummary {
  userId: string
  playerColor: BackgammonColor
  totalLuck: number
  rollCount: number
  jokerCount: number
  antiJokerCount: number
  averageLuck: number
}

export interface LuckAnalysisResult {
  gameId: string
  players: PlayerLuckSummary[]
  rolls: RollLuckResult[]
  analysisComplete: boolean
  error?: string
}

export interface RollInput {
  positionId: string
  dice: [number, number]
  moveNumber: number
  playerId: string
  playerColor: BackgammonColor
}

export interface PlayerInfo {
  userId: string
  color: BackgammonColor
}

/**
 * LuckCalculator - Calculates how favorable dice rolls were compared to expected average.
 *
 * For each roll position:
 * 1. Get equity of best move for the actual dice rolled
 * 2. For all 21 possible dice combinations, calculate weighted average equity
 * 3. Luck = actual equity - expected average equity
 */
export class LuckCalculator {
  /**
   * Get the best move equity for a given position and dice roll.
   * Returns the equity of the best available move, or 0 if no moves available.
   */
  private async getBestMoveEquity(
    positionId: string,
    dice: [number, number],
    playerDirection: 'clockwise' | 'counterclockwise',
    playerColor: BackgammonColor
  ): Promise<number> {
    try {
      const hints = await GnuBgHints.getHintsFromPositionId(
        positionId,
        dice,
        1, // Only need best move
        playerDirection,
        playerColor
      )
      if (hints && hints.length > 0 && typeof hints[0].equity === 'number') {
        return hints[0].equity
      }
      return 0
    } catch {
      // If hints fail (e.g., no legal moves), return 0
      return 0
    }
  }

  /**
   * Calculate expected equity across all 21 possible dice combinations.
   * Returns the probability-weighted average of best move equities.
   */
  private async calculateExpectedEquity(
    positionId: string,
    playerDirection: 'clockwise' | 'counterclockwise',
    playerColor: BackgammonColor
  ): Promise<number> {
    let totalWeightedEquity = 0

    // Calculate equity for each possible dice combination
    for (const { dice, probability } of ALL_DICE_COMBINATIONS) {
      const equity = await this.getBestMoveEquity(positionId, dice, playerDirection, playerColor)
      totalWeightedEquity += equity * probability
    }

    return totalWeightedEquity
  }

  /**
   * Analyze luck for an entire game.
   */
  async analyzeGame(
    gameId: string,
    rolls: RollInput[],
    playerMap: Map<string, PlayerInfo>
  ): Promise<LuckAnalysisResult> {
    const rollResults: RollLuckResult[] = []
    const playerStats = new Map<string, {
      userId: string
      color: BackgammonColor
      totalLuck: number
      rollCount: number
      jokerCount: number
      antiJokerCount: number
    }>()

    // Initialize player stats
    for (const [, info] of playerMap) {
      if (!playerStats.has(info.userId)) {
        playerStats.set(info.userId, {
          userId: info.userId,
          color: info.color,
          totalLuck: 0,
          rollCount: 0,
          jokerCount: 0,
          antiJokerCount: 0,
        })
      }
    }

    // Calculate luck for each roll
    for (const roll of rolls) {
      // Determine player direction based on color
      // Convention: white typically moves clockwise, black counterclockwise
      const playerDirection: 'clockwise' | 'counterclockwise' =
        roll.playerColor === 'white' ? 'clockwise' : 'counterclockwise'

      // Get actual equity for the roll that was made
      const actualEquity = await this.getBestMoveEquity(
        roll.positionId,
        roll.dice,
        playerDirection,
        roll.playerColor
      )

      // Calculate expected equity across all possible rolls
      const expectedEquity = await this.calculateExpectedEquity(
        roll.positionId,
        playerDirection,
        roll.playerColor
      )

      // Luck = how much better (or worse) the actual roll was vs average
      const luck = actualEquity - expectedEquity

      rollResults.push({
        positionId: roll.positionId,
        dice: roll.dice,
        moveNumber: roll.moveNumber,
        playerId: roll.playerId,
        playerColor: roll.playerColor,
        luck,
        expectedEquity,
        actualEquity,
      })

      // Update player stats
      const playerInfo = playerMap.get(roll.playerId)
      if (playerInfo) {
        const stats = playerStats.get(playerInfo.userId)
        if (stats) {
          stats.totalLuck += luck
          stats.rollCount += 1
          if (luck >= JOKER_THRESHOLD) {
            stats.jokerCount += 1
          } else if (luck <= ANTI_JOKER_THRESHOLD) {
            stats.antiJokerCount += 1
          }
        }
      }
    }

    // Build player summaries
    const players: PlayerLuckSummary[] = []
    for (const stats of playerStats.values()) {
      players.push({
        userId: stats.userId,
        playerColor: stats.color,
        totalLuck: stats.totalLuck,
        rollCount: stats.rollCount,
        jokerCount: stats.jokerCount,
        antiJokerCount: stats.antiJokerCount,
        averageLuck: stats.rollCount > 0 ? stats.totalLuck / stats.rollCount : 0,
      })
    }

    return {
      gameId,
      players,
      rolls: rollResults,
      analysisComplete: true,
    }
  }
}

// Export singleton instance
export const luckCalculator = new LuckCalculator()
