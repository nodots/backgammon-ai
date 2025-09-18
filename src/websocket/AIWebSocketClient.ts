import { io, Socket } from 'socket.io-client'
import { BackgammonGame } from '../../../types/src/game'
import {
  AIAnalysisEvent,
  DiceRollEvent,
  GameStateUpdate,
  MoveExecution,
  WebSocketClientConfig,
  WebSocketConnectionState,
  WebSocketMessage,
} from '../../../types/src/websocket'
import { gnubg } from '../gnubg.js'
import { getGnubgMoveHint } from '../index.js'

/**
 * AI WebSocket Client for real-time game analysis and communication
 *
 * This client connects to the nodots-backgammon API WebSocket server and provides:
 * - Real-time AI analysis for game positions
 * - Move suggestions and evaluation
 * - Game state monitoring
 * - Automated AI responses for simulations
 */
export class AIWebSocketClient {
  private socket: Socket | null = null
  private connectionState: WebSocketConnectionState
  private config: WebSocketClientConfig
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<WebSocketClientConfig> = {}) {
    this.config = {
      url: 'https://localhost:3443',
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 5000,
      timeout: 30000,
      enableHeartbeat: true,
      heartbeatInterval: 30000,
      enableCompression: true,
      ...config,
    }

    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      isAuthenticated: false,
      reconnectAttempts: 0,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
    }
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(authToken?: string): Promise<void> {
    if (this.connectionState.isConnecting || this.connectionState.isConnected) {
      console.log('AI WebSocket: Already connected or connecting')
      return
    }

    this.connectionState.isConnecting = true
    console.log(`AI WebSocket: Connecting to ${this.config.url}`)

    try {
      this.socket = io(this.config.url, {
        transports: ['websocket'],
        timeout: this.config.timeout,
        forceNew: true,
        rejectUnauthorized: false, // For development with self-signed certificates
        auth: authToken ? { token: authToken } : undefined,
      })

      this.setupEventHandlers()

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, this.config.timeout)

        this.socket!.on('connect', () => {
          clearTimeout(timeout)
          resolve()
        })

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      console.log('AI WebSocket: Connected successfully')
    } catch (error) {
      console.error('AI WebSocket: Connection failed:', error)
      this.connectionState.isConnecting = false
      throw error
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('AI WebSocket: Disconnecting')
      this.socket.disconnect()
      this.socket = null
    }

    this.clearTimers()
    this.connectionState.isConnected = false
    this.connectionState.isConnecting = false
    this.connectionState.isAuthenticated = false
  }

  /**
   * Setup event handlers for WebSocket communication
   */
  private setupEventHandlers(): void {
    if (!this.socket) return

    // Connection events
    this.socket.on('connect', () => {
      console.log('AI WebSocket: Connected')
      this.connectionState.isConnected = true
      this.connectionState.isConnecting = false
      this.connectionState.reconnectAttempts = 0
      this.connectionState.lastConnectedAt = new Date().toISOString()

      if (this.config.enableHeartbeat) {
        this.startHeartbeat()
      }
    })

    this.socket.on('disconnect', (reason) => {
      console.log('AI WebSocket: Disconnected:', reason)
      this.connectionState.isConnected = false
      this.connectionState.isAuthenticated = false
      this.connectionState.lastDisconnectedAt = new Date().toISOString()
      this.clearTimers()

      if (this.config.autoReconnect && reason !== 'io client disconnect') {
        this.scheduleReconnect()
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('AI WebSocket: Connection error:', error)
      this.connectionState.lastError = error.message
      this.connectionState.isConnecting = false
    })

    // Authentication events
    this.socket.on('AUTHENTICATION_SUCCESS', (data) => {
      console.log('AI WebSocket: Authentication successful')
      this.connectionState.isAuthenticated = true
      this.connectionState.connectionId = data.connectionId
    })

    this.socket.on('AUTHENTICATION_FAILED', (data) => {
      console.error('AI WebSocket: Authentication failed:', data.error)
      this.connectionState.lastError =
        data.error?.message || 'Authentication failed'
    })

    // Game events that trigger AI analysis
    this.socket.on('GAME_STATE_UPDATE', this.handleGameStateUpdate.bind(this))
    this.socket.on('MOVE_EXECUTED', this.handleMoveExecuted.bind(this))
    this.socket.on('DICE_ROLLED', this.handleDiceRolled.bind(this))
    this.socket.on('TURN_START', this.handleTurnStart.bind(this))

    // AI-specific events
    this.socket.on('AI_ANALYSIS_REQUEST', this.handleAnalysisRequest.bind(this))

    // System events
    this.socket.on('PING', () => {
      this.socket?.emit('PONG', { timestamp: new Date().toISOString() })
    })

    this.socket.on('ERROR', (error) => {
      console.error('AI WebSocket: Server error:', error)
      this.connectionState.lastError = error.message
    })
  }

  /**
   * Handle game state updates for AI analysis
   */
  private async handleGameStateUpdate(
    message: WebSocketMessage<GameStateUpdate>
  ): Promise<void> {
    try {
      const { data } = message
      console.log(`AI WebSocket: Game state update for game ${data.game.id}`)

      // Provide AI analysis if game is in progress and has active play
      if (data.gameStatus === 'playing' && data.game.stateKind === 'moving' && 'activePlay' in data.game) {
        await this.analyzeGamePosition(data.game, message.gameId)
      }
    } catch (error) {
      console.error('AI WebSocket: Error handling game state update:', error)
    }
  }

  /**
   * Handle move execution events for analysis
   */
  private async handleMoveExecuted(
    message: WebSocketMessage<MoveExecution>
  ): Promise<void> {
    try {
      const { data } = message
      console.log(`AI WebSocket: Move executed by ${data.playerId}`)

      // Analyze the new position after the move
      if (data.isValid && data.gameState.stateKind === 'moving' && 'activePlay' in data.gameState) {
        await this.analyzeGamePosition(data.gameState, message.gameId)
      }
    } catch (error) {
      console.error('AI WebSocket: Error handling move execution:', error)
    }
  }

  /**
   * Handle dice roll events
   */
  private async handleDiceRolled(
    message: WebSocketMessage<DiceRollEvent>
  ): Promise<void> {
    try {
      const { data } = message
      console.log(
        `AI WebSocket: Dice rolled for player ${
          data.playerId
        }: ${JSON.stringify(data.dice)}`
      )

      // Could trigger position analysis based on new dice
      // Implementation depends on game requirements
    } catch (error) {
      console.error('AI WebSocket: Error handling dice roll:', error)
    }
  }

  /**
   * Handle turn start events
   */
  private async handleTurnStart(message: WebSocketMessage<any>): Promise<void> {
    try {
      console.log(
        `AI WebSocket: Turn started for player ${message.data.playerId}`
      )
      // Could trigger AI move suggestion for automated players
    } catch (error) {
      console.error('AI WebSocket: Error handling turn start:', error)
    }
  }

  /**
   * Handle AI analysis requests
   */
  private async handleAnalysisRequest(
    message: WebSocketMessage<any>
  ): Promise<void> {
    try {
      const { gameId, data } = message
      console.log(`AI WebSocket: Analysis requested for game ${gameId}`)

      if (data.positionId) {
        const analysis = await this.performPositionAnalysis(
          data.positionId,
          data.difficulty || 'intermediate'
        )

        const response: AIAnalysisEvent = {
          gameId: gameId!,
          analysisId: data.analysisId || `analysis_${Date.now()}`,
          moves: analysis.moves,
          evaluation: analysis.evaluation,
          difficulty: data.difficulty || 'intermediate',
        }

        this.sendAIAnalysisResponse(response)
      }
    } catch (error) {
      console.error('AI WebSocket: Error handling analysis request:', error)
    }
  }

  /**
   * Analyze game position and broadcast results
   */
  private async analyzeGamePosition(
    game: BackgammonGame,
    gameId?: string
  ): Promise<void> {
    try {
      // Check if GNU Backgammon is available
      const isAvailable = await gnubg.isAvailable()
      if (!isAvailable) {
        console.log('AI WebSocket: GNU Backgammon not available for analysis')
        return
      }

      // Get position ID from game state (implementation depends on game structure)
      const positionId = this.extractPositionId(game)
      if (!positionId) {
        console.log(
          'AI WebSocket: Could not extract position ID from game state'
        )
        return
      }

      const analysis = await this.performPositionAnalysis(
        positionId,
        'intermediate'
      )

      const analysisEvent: AIAnalysisEvent = {
        gameId: gameId || game.id,
        analysisId: `auto_analysis_${Date.now()}`,
        moves: analysis.moves,
        evaluation: analysis.evaluation,
        difficulty: 'intermediate',
      }

      this.sendAIAnalysisResponse(analysisEvent)
    } catch (error) {
      console.error('AI WebSocket: Error analyzing game position:', error)
    }
  }

  /**
   * Perform AI analysis on a position
   */
  private async performPositionAnalysis(
    positionId: string,
    difficulty: string
  ) {
    try {
      // Get best move from GNU Backgammon
      const bestMove = await getGnubgMoveHint(positionId)

      // For now, return a basic analysis structure
      // In a full implementation, this would include multiple move options and evaluations
      return {
        moves: [bestMove],
        evaluation: {
          equity: 0.0, // Would come from GNU BG analysis
          winProbability: 0.5, // Would come from GNU BG analysis
          gammonProbability: 0.1, // Would come from GNU BG analysis
          backgammonProbability: 0.01, // Would come from GNU BG analysis
        },
      }
    } catch (error) {
      console.error('AI WebSocket: Error performing position analysis:', error)
      throw error
    }
  }

  /**
   * Extract position ID from game state
   * This is a placeholder - implementation depends on game structure
   */
  private extractPositionId(game: BackgammonGame): string | null {
    // Implementation would depend on the game object structure
    // For now, return null as placeholder
    console.log('AI WebSocket: Position ID extraction not yet implemented')
    return null
  }

  /**
   * Send AI analysis response
   */
  private sendAIAnalysisResponse(analysis: AIAnalysisEvent): void {
    if (!this.socket || !this.connectionState.isConnected) {
      console.error('AI WebSocket: Cannot send analysis - not connected')
      return
    }

    const message: WebSocketMessage<AIAnalysisEvent> = {
      type: 'AI_ANALYSIS_RESPONSE',
      gameId: analysis.gameId,
      timestamp: new Date().toISOString(),
      data: analysis,
      messageId: `ai_msg_${Date.now()}`,
    }

    console.log(`AI WebSocket: Sending analysis for game ${analysis.gameId}`)
    this.socket.emit('AI_ANALYSIS_RESPONSE', message)
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (
      this.connectionState.reconnectAttempts >=
      this.connectionState.maxReconnectAttempts
    ) {
      console.log('AI WebSocket: Max reconnection attempts reached')
      return
    }

    this.connectionState.reconnectAttempts++
    const delay =
      this.config.reconnectInterval * this.connectionState.reconnectAttempts

    console.log(
      `AI WebSocket: Scheduling reconnect attempt ${this.connectionState.reconnectAttempts} in ${delay}ms`
    )

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.config.authToken)
      } catch (error) {
        console.error('AI WebSocket: Reconnection failed:', error)
      }
    }, delay)
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.connectionState.isConnected) {
        this.socket.emit('HEARTBEAT', { timestamp: new Date().toISOString() })
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): WebSocketConnectionState {
    return { ...this.connectionState }
  }

  /**
   * Check if connected and authenticated
   */
  isReady(): boolean {
    return (
      this.connectionState.isConnected && this.connectionState.isAuthenticated
    )
  }

  /**
   * Send a manual AI analysis request
   */
  async requestAnalysis(
    gameId: string,
    positionId: string,
    difficulty: string = 'intermediate'
  ): Promise<void> {
    if (!this.isReady()) {
      throw new Error('AI WebSocket: Not connected or authenticated')
    }

    const message: WebSocketMessage<any> = {
      type: 'AI_ANALYSIS_REQUEST',
      gameId,
      timestamp: new Date().toISOString(),
      data: {
        positionId,
        difficulty,
        analysisId: `manual_${Date.now()}`,
      },
      messageId: `ai_request_${Date.now()}`,
    }

    this.socket!.emit('AI_ANALYSIS_REQUEST', message)
  }
}
