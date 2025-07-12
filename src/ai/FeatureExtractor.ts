/**
 * Feature Extractor for Backgammon AI
 * 
 * Converts backgammon board positions into numerical features
 * that can be used by neural networks and other ML algorithms.
 */
export class FeatureExtractor {
  /**
   * Extract features from a backgammon position
   * @param position The backgammon position object
   * @returns Array of numerical features
   */
  extractFeatures(position: any): number[] {
    if (!position) {
      return this.getDefaultFeatures()
    }

    const features: number[] = []

    // 1. Board position features (24 points + bar + off)
    features.push(...this.extractBoardFeatures(position))

    // 2. Game state features
    features.push(...this.extractGameStateFeatures(position))

    // 3. Strategic features
    features.push(...this.extractStrategicFeatures(position))

    // 4. Tactical features
    features.push(...this.extractTacticalFeatures(position))

    return features
  }

  /**
   * Extract features from the board positions
   */
  private extractBoardFeatures(position: any): number[] {
    const features: number[] = []
    
    // For each of the 24 points, extract features
    for (let point = 1; point <= 24; point++) {
      const pointData = position?.board?.[point] || { checkers: 0, owner: null }
      
      // Number of checkers on this point (normalized)
      features.push(pointData.checkers / 15) // Max 15 checkers
      
      // Owner of this point (1 for player, -1 for opponent, 0 for empty)
      const owner = pointData.owner === 'player' ? 1 : 
                   pointData.owner === 'opponent' ? -1 : 0
      features.push(owner)
      
      // Is this a made point (2+ checkers of same color)
      const isMadePoint = pointData.checkers >= 2 && pointData.owner !== null
      features.push(isMadePoint ? 1 : 0)
    }

    // Bar checkers
    const barCheckers = position?.bar?.player || 0
    const opponentBarCheckers = position?.bar?.opponent || 0
    features.push(barCheckers / 15, opponentBarCheckers / 15)

    // Off checkers
    const offCheckers = position?.off?.player || 0
    const opponentOffCheckers = position?.off?.opponent || 0
    features.push(offCheckers / 15, opponentOffCheckers / 15)

    return features
  }

  /**
   * Extract game state features
   */
  private extractGameStateFeatures(position: any): number[] {
    const features: number[] = []

    // Game phase (0-1, where 0 is opening, 1 is endgame)
    const totalCheckers = this.countTotalCheckers(position)
    const gamePhase = Math.min(1, totalCheckers / 30) // Normalize to 0-1
    features.push(gamePhase)

    // Race position (who's ahead in bearing off)
    const playerProgress = this.calculateProgress(position, 'player')
    const opponentProgress = this.calculateProgress(position, 'opponent')
    const racePosition = (playerProgress - opponentProgress) / 167 // Max pip count
    features.push(racePosition)

    // Cube state
    const cubeValue = position?.cube?.value || 1
    const cubeOwner = position?.cube?.owner
    const cubeOwnerValue = cubeOwner === 'player' ? 1 : 
                          cubeOwner === 'opponent' ? -1 : 0
    features.push(cubeValue / 64, cubeOwnerValue) // Max cube is 64

    return features
  }

  /**
   * Extract strategic features
   */
  private extractStrategicFeatures(position: any): number[] {
    const features: number[] = []

    // Number of made points
    const playerMadePoints = this.countMadePoints(position, 'player')
    const opponentMadePoints = this.countMadePoints(position, 'opponent')
    features.push(playerMadePoints / 24, opponentMadePoints / 24)

    // Prime potential (consecutive made points)
    const playerPrimePotential = this.calculatePrimePotential(position, 'player')
    const opponentPrimePotential = this.calculatePrimePotential(position, 'opponent')
    features.push(playerPrimePotential / 6, opponentPrimePotential / 6) // Max prime is 6

    // Anchor positions (made points in opponent's home board)
    const playerAnchors = this.countAnchors(position, 'player')
    const opponentAnchors = this.countAnchors(position, 'opponent')
    features.push(playerAnchors / 6, opponentAnchors / 6)

    // Blot vulnerability
    const playerBlots = this.countBlots(position, 'player')
    const opponentBlots = this.countBlots(position, 'opponent')
    features.push(playerBlots / 15, opponentBlots / 15)

    return features
  }

  /**
   * Extract tactical features
   */
  private extractTacticalFeatures(position: any): number[] {
    const features: number[] = []

    // Hitting opportunities
    const playerHittingChances = this.calculateHittingChances(position, 'player')
    const opponentHittingChances = this.calculateHittingChances(position, 'opponent')
    features.push(playerHittingChances / 36, opponentHittingChances / 36) // Max dice combinations

    // Escaping opportunities
    const playerEscapingChances = this.calculateEscapingChances(position, 'player')
    const opponentEscapingChances = this.calculateEscapingChances(position, 'opponent')
    features.push(playerEscapingChances / 36, opponentEscapingChances / 36)

    // Blocking effectiveness
    const playerBlockingEffectiveness = this.calculateBlockingEffectiveness(position, 'player')
    const opponentBlockingEffectiveness = this.calculateBlockingEffectiveness(position, 'opponent')
    features.push(playerBlockingEffectiveness, opponentBlockingEffectiveness)

    return features
  }

  /**
   * Get default features when position is not available
   */
  private getDefaultFeatures(): number[] {
    // Return neutral features (starting position)
    return new Array(100).fill(0.5) // 100 features with neutral values
  }

  // Helper methods for feature calculations
  private countTotalCheckers(position: any): number {
    let total = 0
    for (let point = 1; point <= 24; point++) {
      total += position?.board?.[point]?.checkers || 0
    }
    total += (position?.bar?.player || 0) + (position?.bar?.opponent || 0)
    total += (position?.off?.player || 0) + (position?.off?.opponent || 0)
    return total
  }

  private calculateProgress(position: any, player: string): number {
    // Calculate pip count (distance from bearing off)
    let progress = 0
    for (let point = 1; point <= 24; point++) {
      const pointData = position?.board?.[point]
      if (pointData?.owner === player) {
        progress += pointData.checkers * (25 - point) // Distance from off
      }
    }
    return progress
  }

  private countMadePoints(position: any, player: string): number {
    let count = 0
    for (let point = 1; point <= 24; point++) {
      const pointData = position?.board?.[point]
      if (pointData?.checkers >= 2 && pointData?.owner === player) {
        count++
      }
    }
    return count
  }

  private calculatePrimePotential(position: any, player: string): number {
    // Calculate potential for creating a prime (consecutive made points)
    let maxConsecutive = 0
    let currentConsecutive = 0
    
    for (let point = 1; point <= 24; point++) {
      const pointData = position?.board?.[point]
      if (pointData?.checkers >= 2 && pointData?.owner === player) {
        currentConsecutive++
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive)
      } else {
        currentConsecutive = 0
      }
    }
    
    return maxConsecutive
  }

  private countAnchors(position: any, player: string): number {
    let count = 0
    const homeBoard = player === 'player' ? [19, 20, 21, 22, 23, 24] : [1, 2, 3, 4, 5, 6]
    
    for (const point of homeBoard) {
      const pointData = position?.board?.[point]
      if (pointData?.checkers >= 2 && pointData?.owner === player) {
        count++
      }
    }
    return count
  }

  private countBlots(position: any, player: string): number {
    let count = 0
    for (let point = 1; point <= 24; point++) {
      const pointData = position?.board?.[point]
      if (pointData?.checkers === 1 && pointData?.owner === player) {
        count++
      }
    }
    return count
  }

  private calculateHittingChances(position: any, player: string): number {
    // Simplified calculation of hitting opportunities
    let chances = 0
    const opponentBlots = this.countBlots(position, player === 'player' ? 'opponent' : 'player')
    chances = opponentBlots * 6 // Rough estimate based on number of blots
    return Math.min(chances, 36) // Cap at maximum dice combinations
  }

  private calculateEscapingChances(position: any, player: string): number {
    // Simplified calculation of escaping opportunities
    const barCheckers = position?.bar?.[player] || 0
    return barCheckers * 6 // Rough estimate
  }

  private calculateBlockingEffectiveness(position: any, player: string): number {
    // Calculate how effectively the player is blocking the opponent
    const opponentHomeBoard = player === 'player' ? [1, 2, 3, 4, 5, 6] : [19, 20, 21, 22, 23, 24]
    let blockingScore = 0
    
    for (const point of opponentHomeBoard) {
      const pointData = position?.board?.[point]
      if (pointData?.checkers >= 2 && pointData?.owner === player) {
        blockingScore += pointData.checkers
      }
    }
    
    return blockingScore / 30 // Normalize
  }
}