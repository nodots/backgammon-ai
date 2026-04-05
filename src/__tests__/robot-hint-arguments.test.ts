/**
 * Validate the GNUBG hint request arguments passed by executeRobotTurnWithGNU.
 * This isolates direction/color/roll wiring on the Nodots side.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const initializeMock = jest.fn().mockResolvedValue(undefined)
const configureMock = jest.fn().mockResolvedValue(undefined)
const getHintsMock = jest.fn().mockResolvedValue([{
  moves: [
    {
      from: 13,
      to: 10,
      moveKind: 'point-to-point',
      player: 'white',
      fromContainer: 'point',
      toContainer: 'point',
      isHit: false,
    },
  ],
}])

const executeAndRecalculateMock = jest.fn((game: any) => ({
  ...game,
  activePlay: { ...game.activePlay, moves: [] },
  stateKind: 'moving',
}))
const checkAndCompleteTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))
const confirmTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))

jest.unstable_mockModule('@nodots-llc/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    configure: configureMock,
    getHintsFromPositionId: getHintsMock,
  },
}))

jest.unstable_mockModule('@nodots-llc/backgammon-core', () => ({
  Game: {
    executeAndRecalculate: executeAndRecalculateMock,
    checkAndCompleteTurn: checkAndCompleteTurnMock,
    confirmTurn: confirmTurnMock,
  },
  exportToGnuPositionId: () => 'pid',
}))

const { executeRobotTurnWithGNU } = await import('../robotExecution.js')

const createGame = () => {
  const activePlayer = {
    id: 'player-1',
    color: 'white',
    direction: 'counterclockwise',
    stateKind: 'moving',
    isRobot: true,
    dice: { stateKind: 'rolled', currentRoll: [3, 5] },
  }
  return {
    id: 'game-1',
    stateKind: 'moving',
    board: {
      id: 'board-1',
      points: [],
      bar: { clockwise: { checkers: [] }, counterclockwise: { checkers: [] } },
      off: { clockwise: { checkers: [] }, counterclockwise: { checkers: [] } },
    },
    activeColor: activePlayer.color,
    activePlayer,
    activePlay: {
      id: 'play-1',
      stateKind: 'moving',
      player: activePlayer,
      moves: [
        {
          id: 'move-3',
          stateKind: 'ready',
          dieValue: 3,
          moveKind: 'point-to-point',
          possibleMoves: [
            {
              origin: { id: 'point-13', kind: 'point', position: { counterclockwise: 13 } },
              destination: { id: 'point-10', kind: 'point', position: { counterclockwise: 10 } },
              dieValue: 3,
              isHit: false,
            },
          ],
        },
        {
          id: 'move-5',
          stateKind: 'ready',
          dieValue: 5,
          moveKind: 'point-to-point',
          possibleMoves: [
            {
              origin: { id: 'point-8', kind: 'point', position: { counterclockwise: 8 } },
              destination: { id: 'point-3', kind: 'point', position: { counterclockwise: 3 } },
              dieValue: 5,
              isHit: false,
            },
          ],
        },
      ],
    },
    players: [activePlayer],
  }
}

beforeEach(() => {
  initializeMock.mockClear()
  configureMock.mockClear()
  getHintsMock.mockClear()
  executeAndRecalculateMock.mockClear()
  checkAndCompleteTurnMock.mockClear()
  confirmTurnMock.mockClear()
})

describe('executeRobotTurnWithGNU hint argument wiring', () => {
  it('passes active direction and color to getHintsFromPositionId', async () => {
    const game = createGame()
    await executeRobotTurnWithGNU(game as any)

    expect(getHintsMock).toHaveBeenCalledTimes(1)
    const args = getHintsMock.mock.calls[0]
    expect(args[0]).toBe('pid')
    expect(args[1]).toEqual([3, 5])
    expect(args[3]).toBe('counterclockwise')
    expect(args[4]).toBe('white')
  })
})
