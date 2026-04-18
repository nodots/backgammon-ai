/**
 * Tests to isolate bar-first reentry mismatches in robot execution.
 * These are written to fail if robot execution follows a non-bar GNU plan
 * while bar reentry is still required.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let plannedMoves: any[] = []
let executeCalls: string[] = []
let executeOptions: Array<any | undefined> = []
let executeBehavior: (game: any, originId: string) => any

const initializeMock = jest.fn().mockResolvedValue(undefined)
const configureMock = jest.fn().mockResolvedValue(undefined)
const getHintsMock = jest.fn(() => Promise.resolve([{ moves: plannedMoves }]))

const executeAndRecalculateMock = jest.fn((game: any, originId: string, options?: any) => {
  executeCalls.push(originId)
  executeOptions.push(options)
  if (executeBehavior) {
    return executeBehavior(game, originId)
  }
  return {
    ...game,
    activePlay: { ...game.activePlay, moves: [] },
    stateKind: 'moving',
  }
})
const checkAndCompleteTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))
const confirmTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))
const exportToGnuPositionIdMock = jest.fn(() => 'pid')

jest.unstable_mockModule('@nodots/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    configure: configureMock,
    getHintsFromPositionId: getHintsMock,
  },
}))

jest.unstable_mockModule('@nodots/backgammon-core', () => ({
  Board: {},
  Game: {
    executeAndRecalculate: executeAndRecalculateMock,
    checkAndCompleteTurn: checkAndCompleteTurnMock,
    confirmTurn: confirmTurnMock,
  },
  exportToGnuPositionId: exportToGnuPositionIdMock,
}))

const { executeRobotTurnWithGNU } = await import('../robotExecution.js')

const createBoard = () => {
  const points = Array.from({ length: 24 }, (_, idx) => ({
    id: `point-${idx + 1}`,
    kind: 'point',
    position: { clockwise: idx + 1, counterclockwise: idx + 1 },
    checkers: [],
  }))
  return {
    id: 'board-1',
    points,
    bar: {
      clockwise: {
        id: 'bar-cw',
        kind: 'bar',
        direction: 'clockwise',
        position: 'bar',
        checkers: [{ id: 'b1', color: 'black' }],
      },
      counterclockwise: {
        id: 'bar-ccw',
        kind: 'bar',
        direction: 'counterclockwise',
        position: 'bar',
        checkers: [],
      },
    },
    off: {
      clockwise: { id: 'off-cw', kind: 'off', checkers: [] },
      counterclockwise: { id: 'off-ccw', kind: 'off', checkers: [] },
    },
  }
}

const createGame = (readyMoves: any[]) => {
  const board = createBoard()
  const activePlayer = {
    id: 'player-1',
    color: 'black',
    direction: 'clockwise',
    stateKind: 'moving',
    isRobot: true,
    dice: { stateKind: 'rolled', currentRoll: [1, 2] },
  }
  return {
    id: 'game-1',
    stateKind: 'moving',
    board,
    activeColor: 'black',
    activePlayer,
    activePlay: {
      id: 'play-1',
      stateKind: 'moving',
      player: activePlayer,
      moves: readyMoves,
    },
    players: [activePlayer],
  }
}

const createBarMove = (dieValue: number, destinationPos: number) => ({
  id: `move-bar-${dieValue}`,
  stateKind: 'ready',
  moveKind: 'reenter',
  dieValue,
  possibleMoves: [
    {
      origin: { id: 'bar-cw', kind: 'bar' },
      destination: {
        id: `point-${destinationPos}`,
        kind: 'point',
        position: { clockwise: destinationPos },
      },
      dieValue,
    },
  ],
})

const createPointMove = (
  originPos: number,
  destinationPos: number,
  dieValue: number
) => ({
  id: `move-point-${originPos}-${destinationPos}`,
  stateKind: 'ready',
  moveKind: 'point-to-point',
  dieValue,
  possibleMoves: [
    {
      origin: {
        id: `point-${originPos}`,
        kind: 'point',
        position: { clockwise: originPos },
      },
      destination: {
        id: `point-${destinationPos}`,
        kind: 'point',
        position: { clockwise: destinationPos },
      },
      dieValue,
    },
  ],
})

beforeEach(() => {
  plannedMoves = []
  executeCalls = []
  executeOptions = []
  executeBehavior = (game) => ({
    ...game,
    activePlay: { ...game.activePlay, moves: [] },
    stateKind: 'moving',
  })
  executeAndRecalculateMock.mockClear()
  checkAndCompleteTurnMock.mockClear()
  confirmTurnMock.mockClear()
  exportToGnuPositionIdMock.mockClear()
})

describe('executeRobotTurnWithGNU bar-first enforcement', () => {
  it('prefers bar reentry even when GNU plans a point-to-point move', async () => {
    plannedMoves = [
      {
        from: 24,
        to: 23,
        moveKind: 'point-to-point',
        player: 'black',
        fromContainer: 'point',
        toContainer: 'point',
        isHit: false,
      },
    ]

    const readyMoves = [
      createBarMove(1, 24),
      createPointMove(24, 23, 1),
    ]
    const game = createGame(readyMoves)

    await expect(executeRobotTurnWithGNU(game as any)).resolves.toBeDefined()
    expect(executeCalls[0]).toBe('bar-cw')
  })

  it('falls back to a bar move when GNU plan has no legal match', async () => {
    plannedMoves = [
      {
        from: 24,
        to: 23,
        moveKind: 'point-to-point',
        player: 'black',
        fromContainer: 'point',
        toContainer: 'point',
        isHit: false,
      },
    ]

    const readyMoves = [createBarMove(1, 24)]
    const game = createGame(readyMoves)

    await expect(executeRobotTurnWithGNU(game as any)).resolves.toBeDefined()
    expect(executeCalls[0]).toBe('bar-cw')
  })

  it('does not execute a stale non-bar step while bar checkers remain', async () => {
    plannedMoves = [
      {
        from: 25,
        to: 24,
        moveKind: 'reenter',
        player: 'black',
        fromContainer: 'bar',
        toContainer: 'point',
        isHit: false,
      },
      {
        from: 24,
        to: 23,
        moveKind: 'point-to-point',
        player: 'black',
        fromContainer: 'point',
        toContainer: 'point',
        isHit: false,
      },
    ]

    let callCount = 0
    executeBehavior = (game) => {
      callCount += 1
      if (callCount === 1) {
        return {
          ...game,
          activePlay: { ...game.activePlay, moves: [createBarMove(2, 23)] },
          stateKind: 'moving',
        }
      }
      return {
        ...game,
        activePlay: { ...game.activePlay, moves: [] },
        stateKind: 'moving',
      }
    }

    const readyMoves = [createBarMove(1, 24)]
    const game = createGame(readyMoves)

    await expect(executeRobotTurnWithGNU(game as any)).resolves.toBeDefined()
    expect(executeCalls).toEqual(['bar-cw', 'bar-cw'])
  })

  it('passes exact destination and die when matching a bar reentry plan', async () => {
    plannedMoves = [
      {
        from: 25,
        to: 24,
        moveKind: 'reenter',
        player: 'black',
        fromContainer: 'bar',
        toContainer: 'point',
        isHit: false,
      },
    ]

    const readyMoves = [createBarMove(1, 24)]
    const game = createGame(readyMoves)

    await expect(executeRobotTurnWithGNU(game as any)).resolves.toBeDefined()
    expect(executeCalls[0]).toBe('bar-cw')
    expect(executeOptions[0]).toEqual({
      desiredDestinationId: 'point-24',
      expectedDieValue: 1,
    })
  })
})
