import { WebSocketClientConfig } from '../../../types/src/websocket'
import { gnubg } from '../gnubg.js'
import { AIWebSocketClient } from './AIWebSocketClient.js'

/**
 * Configuration options for the AI WebSocket Service
 */
export interface AIWebSocketServiceConfig
  extends Partial<WebSocketClientConfig> {
  enableAutoAnalysis?: boolean
  analysisDelay?: number
  maxConcurrentAnalysis?: number
  gnubgPath?: string
}

/**
 * AI WebSocket Service for managing real-time AI analysis
 *
 * This service provides:
 * - Managed WebSocket client lifecycle
 * - Automatic AI analysis for game events
 * - Queue management for analysis requests
 * - GNU Backgammon integration
 */
export class AIWebSocketService {
  private client: AIWebSocketClient
  private config: AIWebSocketServiceConfig
  private isRunning = false
  private analysisQueue: Array<{
    gameId: string
    positionId: string
    difficulty: string
  }> = []
  private activeAnalysis = new Set<string>()

  constructor(config: AIWebSocketServiceConfig = {}) {
    this.config = {
      enableAutoAnalysis: true,
      analysisDelay: 1000, // 1 second delay between analyses
      maxConcurrentAnalysis: 3,
      ...config,
    }

    this.client = new AIWebSocketClient(this.config)
  }

  /**
   * Start the AI WebSocket service
   */
  async start(authToken?: string): Promise<void> {
    if (this.isRunning) {
      console.log('AI WebSocket Service: Already running')
      return
    }

    console.log('AI WebSocket Service: Starting...')

    try {
      // Check GNU Backgammon availability
      const isGnubgAvailable = await gnubg.isAvailable()
      if (!isGnubgAvailable) {
        console.warn('AI WebSocket Service: GNU Backgammon not available')
        console.warn('AI WebSocket Service: ' + gnubg.getBuildInstructions())
      }

      // Connect WebSocket client
      await this.client.connect(authToken)

      this.isRunning = true
      console.log('AI WebSocket Service: Started successfully')

      // Start processing analysis queue
      if (this.config.enableAutoAnalysis) {
        this.startAnalysisProcessor()
      }
    } catch (error) {
      console.error('AI WebSocket Service: Failed to start:', error)
      throw error
    }
  }

  /**
   * Stop the AI WebSocket service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('AI WebSocket Service: Already stopped')
      return
    }

    console.log('AI WebSocket Service: Stopping...')

    this.isRunning = false
    this.client.disconnect()
    this.analysisQueue = []
    this.activeAnalysis.clear()

    console.log('AI WebSocket Service: Stopped')
  }

  /**
   * Check if the service is running and ready
   */
  isReady(): boolean {
    return this.isRunning && this.client.isReady()
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    return this.client.getConnectionState()
  }

  /**
   * Request AI analysis for a specific position
   */
  async requestAnalysis(
    gameId: string,
    positionId: string,
    difficulty: string = 'intermediate'
  ): Promise<void> {
    if (!this.isReady()) {
      throw new Error('AI WebSocket Service: Service not ready')
    }

    try {
      await this.client.requestAnalysis(gameId, positionId, difficulty)
      console.log(`AI WebSocket Service: Analysis requested for game ${gameId}`)
    } catch (error) {
      console.error('AI WebSocket Service: Failed to request analysis:', error)
      throw error
    }
  }

  /**
   * Queue an analysis request for later processing
   */
  queueAnalysis(
    gameId: string,
    positionId: string,
    difficulty: string = 'intermediate'
  ): void {
    // Avoid duplicate requests for the same position
    const requestKey = `${gameId}_${positionId}`
    if (this.activeAnalysis.has(requestKey)) {
      console.log(
        `AI WebSocket Service: Analysis already in progress for ${requestKey}`
      )
      return
    }

    this.analysisQueue.push({ gameId, positionId, difficulty })
    console.log(
      `AI WebSocket Service: Analysis queued for game ${gameId}, queue size: ${this.analysisQueue.length}`
    )
  }

  /**
   * Start the analysis queue processor
   */
  private startAnalysisProcessor(): void {
    const processQueue = async () => {
      if (!this.isRunning || !this.isReady()) {
        setTimeout(processQueue, this.config.analysisDelay)
        return
      }

      // Process queue if we have capacity
      if (
        this.analysisQueue.length > 0 &&
        this.activeAnalysis.size < this.config.maxConcurrentAnalysis!
      ) {
        const request = this.analysisQueue.shift()!
        const requestKey = `${request.gameId}_${request.positionId}`

        this.activeAnalysis.add(requestKey)

        try {
          await this.client.requestAnalysis(
            request.gameId,
            request.positionId,
            request.difficulty
          )
          console.log(
            `AI WebSocket Service: Processed analysis for ${requestKey}`
          )
        } catch (error) {
          console.error(
            'AI WebSocket Service: Error processing analysis:',
            error
          )
        } finally {
          // Remove from active analysis after delay
          setTimeout(() => {
            this.activeAnalysis.delete(requestKey)
          }, this.config.analysisDelay! * 2)
        }
      }

      // Schedule next processing cycle
      setTimeout(processQueue, this.config.analysisDelay)
    }

    processQueue()
  }

  /**
   * Get GNU Backgammon information
   */
  async getGnubgInfo() {
    return {
      available: await gnubg.isAvailable(),
      path: await gnubg.getGnubgPath(),
      hasLocalBuild: await gnubg.hasLocalBuild(),
      version: await gnubg.getVersion().catch(() => 'Unknown'),
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      isReady: this.isReady(),
      queueLength: this.analysisQueue.length,
      activeAnalysis: this.activeAnalysis.size,
      maxConcurrentAnalysis: this.config.maxConcurrentAnalysis,
      connectionState: this.client.getConnectionState(),
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<AIWebSocketServiceConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log('AI WebSocket Service: Configuration updated')
  }
}
