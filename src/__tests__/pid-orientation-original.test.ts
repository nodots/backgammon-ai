/**
 * Regression: Always use canonical GNU Position ID for hint requests
 *
 * Ensures executeRobotTurnWithGNU calls GnuBgHints.getHintsFromPositionId with the
 * unmodified gnuPositionId (no half-rotation), aligning with GNU's standard.
 *
 * This test mocks @nodots/gnubg-hints to avoid requiring the native addon.
 */

import { jest } from '@jest/globals'

// Mock the gnubg-hints module
const initializeMock = jest.fn().mockResolvedValue(undefined)
const getMoveHintsMock = jest.fn().mockResolvedValue([])

jest.unstable_mockModule('@nodots/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    getMoveHints: getMoveHintsMock,
  },
  createHintRequestFromGame: () => ({
    board: { points: [], bar: {}, off: {} },
    dice: [0, 0],
    activePlayerColor: 'black',
    activePlayerDirection: 'clockwise',
    cubeValue: 1,
    cubeOwner: null,
    matchScore: [0, 0],
    matchLength: 0,
    crawford: false,
    jacoby: false,
    beavers: false,
  }),
}))

// Import under test after mock
const { executeRobotTurnWithGNU } = await import('../robotExecution.js')

// Minimal Backgammon types for the test (structure only)
type Dir = 'clockwise' | 'counterclockwise'

const makeGame = (pid: string) => ({
  id: 'game-test',
  stateKind: 'moving',
  gnuPositionId: pid,
  board: { points: [], bar: { clockwise: { checkers: [] }, counterclockwise: { checkers: [] } }, off: { clockwise: { checkers: [] }, counterclockwise: { checkers: [] } } },
  players: [
    {
      id: 'player-black',
      color: 'black',
      direction: 'clockwise',
      stateKind: 'moving',
      isRobot: true,
      dice: { stateKind: 'inactive', color: 'black' },
    },
    {
      id: 'player-white',
      color: 'white',
      direction: 'counterclockwise',
      stateKind: 'inactive',
      isRobot: false,
      dice: { stateKind: 'inactive', color: 'white' },
    },
  ],
  activeColor: 'black',
  activePlayer: {
    color: 'black',
    direction: 'clockwise' as Dir,
    stateKind: 'moving',
    isRobot: true,
    dice: { currentRoll: [6, 5], stateKind: 'inactive', color: 'black' },
  },
  inactivePlayer: {
    color: 'white',
    direction: 'counterclockwise' as Dir,
    stateKind: 'inactive',
    isRobot: false,
    dice: { stateKind: 'inactive', color: 'white' },
  },
}) as any

describe('executeRobotTurnWithGNU - hint request shape', () => {
  it('requests move hints with active player direction', async () => {
    const PID = 'Og4AAN9rAwAgAA'
    const game = makeGame(PID)

    await expect(executeRobotTurnWithGNU(game)).rejects.toThrow(/returned no hints/i)

    expect(initializeMock).toHaveBeenCalled()
    expect(getMoveHintsMock).toHaveBeenCalled()
    const firstCallArgs = getMoveHintsMock.mock.calls[0]
    expect(firstCallArgs[0]?.activePlayerColor).toBe('black')
    expect(firstCallArgs[0]?.activePlayerDirection).toBe('clockwise')
  })
})
