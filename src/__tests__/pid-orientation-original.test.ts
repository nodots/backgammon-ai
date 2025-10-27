/**
 * Regression: Always use canonical GNU Position ID for hint requests
 *
 * Ensures executeRobotTurnWithGNU calls GnuBgHints.getHintsFromPositionId with the
 * unmodified gnuPositionId (no half-rotation), aligning with GNU's standard.
 *
 * This test mocks @nodots-llc/gnubg-hints to avoid requiring the native addon.
 */

import { jest } from '@jest/globals'

// Mock the gnubg-hints module
const getHintsFromPositionIdMock = jest.fn().mockResolvedValue([])
const initializeMock = jest.fn().mockResolvedValue(undefined)

jest.unstable_mockModule('@nodots-llc/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    getHintsFromPositionId: getHintsFromPositionIdMock,
  },
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
  players: [],
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

describe('executeRobotTurnWithGNU - canonical PID usage', () => {
  it('calls getHintsFromPositionId with the original gnuPositionId', async () => {
    const PID = 'Og4AAN9rAwAgAA'
    const game = makeGame(PID)

    await expect(executeRobotTurnWithGNU(game)).rejects.toThrow(/returned no moves/i)

    expect(initializeMock).toHaveBeenCalled()
    expect(getHintsFromPositionIdMock).toHaveBeenCalled()

    // First call should use the original PID exactly
    const firstCallArgs = getHintsFromPositionIdMock.mock.calls[0]
    expect(firstCallArgs[0]).toBe(PID)
  })
})

