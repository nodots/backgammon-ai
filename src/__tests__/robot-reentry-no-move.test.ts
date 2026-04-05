/**
 * Regression: Robot reentry with one legal die should convert remaining die to no-move
 * and pass the turn to the human player.
 */

import { jest } from '@jest/globals'

const initializeMock = jest.fn().mockResolvedValue(undefined)
const getMoveHintsMock = jest.fn().mockResolvedValue([
  {
    rank: 1,
    equity: 0,
    evaluation: null,
    difference: 0,
    moves: [
      {
        from: 0,
        to: 23, // die 2 reentry: 25 - 23 = 2
        moveKind: 'reenter',
        player: 'black',
        fromContainer: 'bar',
        toContainer: 'point',
        isHit: false,
      },
    ],
  },
])

jest.unstable_mockModule('@nodots-llc/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    getMoveHints: getMoveHintsMock,
  },
  createHintRequestFromGame: (game: any, overrides: any = {}) => ({
    board: overrides.board ?? game.board,
    dice: overrides.dice ?? game.activePlayer?.dice?.currentRoll ?? [0, 0],
    activePlayerColor:
      overrides.activePlayerColor ?? game.activePlayer?.color ?? 'black',
    activePlayerDirection:
      overrides.activePlayerDirection ??
      game.activePlayer?.direction ??
      'counterclockwise',
    cubeValue: 1,
    cubeOwner: null,
    matchScore: [0, 0],
    matchLength: 0,
    crawford: false,
    jacoby: false,
    beavers: false,
  }),
}))

jest.unstable_mockModule('@nodots-llc/backgammon-core', () => ({
  generateId: () => 'mock-id',
  logger: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
  Board: {
    getPossibleMoves: (board: any, player: any, dieValue: number) => {
      const bar = board.bar[player.direction]
      const hasOwnOnBar = bar.checkers.some((c: any) => c.color === player.color)
      if (hasOwnOnBar) {
        const targetPos = 25 - dieValue
        const destination = board.points.find(
          (p: any) => p.position[player.direction] === targetPos
        )
        const isBlocked =
          destination &&
          destination.checkers.length >= 2 &&
          destination.checkers[0].color !== player.color
        if (!destination || isBlocked) {
          return []
        }
        return [
          {
            origin: bar,
            destination,
            dieValue,
            direction: player.direction,
          },
        ]
      }
      return []
    },
  },
  Game: {
    executeAndRecalculate: (game: any, originId: string, options: any = {}) => {
      const destinationId = options.desiredDestinationId
      const expectedDieValue = options.expectedDieValue
      const bar = game.board.bar[game.activePlayer.direction]
      const destination = game.board.points.find((p: any) => p.id === destinationId)
      if (!destination || bar.id !== originId) {
        throw new Error('Mock executeAndRecalculate failed to resolve move')
      }

      const movingChecker = bar.checkers.pop()
      if (movingChecker) {
        destination.checkers.push(movingChecker)
      }

      const updatedMoves = game.activePlay.moves.map((move: any) => {
        if (move.dieValue === expectedDieValue && move.stateKind === 'ready') {
          return {
            ...move,
            stateKind: 'completed',
            moveKind: 'reenter',
          }
        }
        return move
      })

      return {
        ...game,
        board: game.board,
        activePlay: {
          ...game.activePlay,
          moves: updatedMoves,
        },
        stateKind: 'moving',
      }
    },
    checkAndCompleteTurn: (game: any) => {
      const moves = game.activePlay?.moves ?? []
      const allCompleted = moves.length > 0 && moves.every((m: any) => m.stateKind === 'completed')
      if (!allCompleted) {
        return game
      }
      return {
        ...game,
        stateKind: 'moved',
      }
    },
    confirmTurn: (game: any) => {
      const nextColor = game.activeColor === 'black' ? 'white' : 'black'
      const nextActive = game.players.find((p: any) => p.color === nextColor)
      const nextInactive = game.players.find((p: any) => p.color !== nextColor)
      return {
        ...game,
        stateKind: 'rolling',
        activeColor: nextColor,
        activePlayer: nextActive,
        inactivePlayer: nextInactive,
        activePlay: undefined,
      }
    },
  },
  ascii: () => '[ASCII board unavailable]',
}))

const { executeRobotTurnWithGNU } = await import('../robotExecution.js')

describe('executeRobotTurnWithGNU - bar reentry no-move completion', () => {
  it('completes the turn when only one reentry is legal', async () => {
    const points = Array.from({ length: 24 }, (_, idx) => ({
      id: `point-${idx + 1}`,
      kind: 'point',
      position: { clockwise: idx + 1, counterclockwise: idx + 1 },
      checkers: [],
    }))
    const blockedPoint = points.find((p) => p.position.counterclockwise === 20)!
    blockedPoint.checkers = [
      { id: 'w1', color: 'white' },
      { id: 'w2', color: 'white' },
    ]

    const board = {
      id: 'board-1',
      points,
      bar: {
        clockwise: { id: 'bar-cw', kind: 'bar', checkers: [] },
        counterclockwise: {
          id: 'bar-ccw',
          kind: 'bar',
          checkers: [{ id: 'b1', color: 'black' }],
        },
      },
      off: {
        clockwise: { id: 'off-cw', kind: 'off', checkers: [] },
        counterclockwise: { id: 'off-ccw', kind: 'off', checkers: [] },
      },
    }

    const robotMoving = {
      id: 'robot-black',
      color: 'black',
      direction: 'counterclockwise',
      stateKind: 'moving',
      isRobot: true,
      dice: { stateKind: 'rolled', currentRoll: [5, 2] },
    }

    const humanInactive = {
      id: 'human-white',
      color: 'white',
      direction: 'clockwise',
      stateKind: 'inactive',
      isRobot: false,
      dice: { stateKind: 'inactive' },
    }

    const activePlay = {
      id: 'play-1',
      stateKind: 'moving',
      player: robotMoving,
      board,
      moves: [
        { id: 'move-5', dieValue: 5, stateKind: 'ready', moveKind: 'reenter', possibleMoves: [] },
        { id: 'move-2', dieValue: 2, stateKind: 'ready', moveKind: 'reenter', possibleMoves: [] },
      ],
    }

    const game = {
      id: 'game-reentry',
      stateKind: 'moving',
      board,
      players: [robotMoving, humanInactive],
      activeColor: 'black',
      activePlayer: robotMoving,
      inactivePlayer: humanInactive,
      activePlay,
    }

    const updatedGame = await executeRobotTurnWithGNU(game as any)

    expect(updatedGame.stateKind).toBe('rolling')
    expect(updatedGame.activeColor).toBe('white')
    expect(updatedGame.activePlayer.isRobot).toBe(false)
    expect(
      updatedGame.board.bar.counterclockwise.checkers.filter(
        (c: any) => c.color === 'black'
      ).length
    ).toBe(0)
  })
})
