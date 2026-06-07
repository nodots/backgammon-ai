/**
 * Regression for production game 2d98cf14-e262-433c-baf5-95a2f878311d.
 *
 * The robot (black, clockwise) had one checker on its 2-point, 14 off, and
 * rolled [3,5]. Either die bears off the last checker, so core computes
 * maxDiceUsable = 1 with both dice playable at turn start — the rules then
 * require the larger die (5).
 *
 * GNU's bearoff hint is a single step {from: 2, to: 0} with no die value.
 * The matcher in robotExecution.ts matches bear-off steps on origin position
 * only, so both the die-3 and die-5 ready moves match. It took the first
 * ready move in roll order (die 3); core rejected the turn with
 * MustUseLargerDieError on every retry, and the game froze in 'moving'.
 *
 * The fix sorts ready moves by die value descending before matching, so the
 * ambiguous bear-off resolves to the larger die. Point-to-point and reenter
 * matching is die-unique (origin+destination determine the die), so the sort
 * has no effect there.
 *
 * The game fixture reproduces the stale persisted play: both moves ready,
 * smaller die first — the shape written to the database before core started
 * pruning the smaller-die move in Play.initialize.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let plannedHints: any[] = []
let executeCalls: Array<{ originId: string; options?: any }> = []
let currentReadyMoves: any[] = []

const initializeMock = jest.fn().mockResolvedValue(undefined)
const configureMock = jest.fn().mockResolvedValue(undefined)
const getHintsMock = jest.fn(() => Promise.resolve(plannedHints))

const executeAndRecalculateMock = jest.fn(
  (game: any, originId: string, options?: any) => {
    executeCalls.push({ originId, options })
    // Bearing off the last checker wins the game.
    currentReadyMoves = []
    return {
      ...game,
      activePlay: { ...game.activePlay, moves: [] },
      stateKind: 'completed',
    }
  }
)
const checkAndCompleteTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'moved',
}))
const handleRobotMovedStateMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))
const exportToGnuPositionIdMock = jest.fn(() => '37sEIAACAAAAAA')

jest.unstable_mockModule('@nodots/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    configure: configureMock,
    getHintsFromPositionId: getHintsMock,
  },
}))

const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

const getPossibleMovesMock = jest.fn(
  (_board: any, _player: any, dieValue: any) => {
    const match = currentReadyMoves.find((m) => m?.dieValue === dieValue)
    return match?.possibleMoves || []
  }
)

jest.unstable_mockModule('@nodots/backgammon-core', () => ({
  Board: { getPossibleMoves: getPossibleMovesMock },
  Game: {
    executeAndRecalculate: executeAndRecalculateMock,
    checkAndCompleteTurn: checkAndCompleteTurnMock,
    handleRobotMovedState: handleRobotMovedStateMock,
  },
  exportToGnuPositionId: exportToGnuPositionIdMock,
  logger: noopLogger,
}))

const { executeRobotTurnWithGNU } = await import('../robotExecution.js')

const buildLastCheckerGame = () => {
  // Black is clockwise: GNU `from` values are clockwise position numbers.
  const point2 = {
    id: 'point-cw2',
    kind: 'point',
    position: { clockwise: 2, counterclockwise: 23 },
    checkers: [{ color: 'black' }],
  }
  const offCw = { id: 'off-cw', kind: 'off', checkers: [] }
  const offCcw = { id: 'off-ccw', kind: 'off', checkers: [] }

  // Stale persisted play: smaller die first, both ready, both bear off the
  // same checker — exactly what the database held for game 2d98cf14.
  const die3Move = {
    id: 'm-die3',
    stateKind: 'ready',
    moveKind: 'bear-off',
    dieValue: 3,
    possibleMoves: [{ origin: point2, destination: offCw, dieValue: 3 }],
  }
  const die5Move = {
    id: 'm-die5',
    stateKind: 'ready',
    moveKind: 'bear-off',
    dieValue: 5,
    possibleMoves: [{ origin: point2, destination: offCw, dieValue: 5 }],
  }

  const activePlayer = {
    id: 'player-black',
    color: 'black',
    direction: 'clockwise',
    stateKind: 'moving',
    isRobot: true,
    dice: { stateKind: 'rolled', currentRoll: [3, 5] },
  }

  currentReadyMoves = [die3Move, die5Move]

  return {
    id: 'game-2d98cf14',
    stateKind: 'moving',
    board: {
      id: 'board-1',
      points: Array.from({ length: 24 }, (_, i) => {
        if (i + 1 === 2) return point2
        return {
          id: `point-${i + 1}`,
          kind: 'point',
          position: { clockwise: i + 1, counterclockwise: 25 - (i + 1) },
          checkers: [],
        }
      }),
      bar: {
        clockwise: { id: 'bar-cw', kind: 'bar', checkers: [] },
        counterclockwise: { id: 'bar-ccw', kind: 'bar', checkers: [] },
      },
      off: { clockwise: offCw, counterclockwise: offCcw },
    },
    activeColor: 'black',
    activePlayer,
    activePlay: {
      id: 'play-1',
      stateKind: 'moving',
      player: activePlayer,
      moves: [die3Move, die5Move],
    },
    players: [activePlayer],
  }
}

beforeEach(() => {
  plannedHints = []
  executeCalls = []
  currentReadyMoves = []
  executeAndRecalculateMock.mockClear()
  getHintsMock.mockClear()
})

describe('last-checker bear-off resolves the GNU die ambiguity to the larger die', () => {
  it('executes the single planned bear-off with die 5, not die 3', async () => {
    plannedHints = [
      {
        equity: 2.0185277462005615,
        moves: [
          {
            from: 2,
            to: 0,
            moveKind: 'bear-off',
            player: 'black',
            isHit: false,
            fromContainer: 'point',
            toContainer: 'off',
          },
        ],
      },
    ]

    const game = buildLastCheckerGame()
    const result = await executeRobotTurnWithGNU(game as any) // cast: fixture stands in for BackgammonGameMoving

    expect(result.stateKind).toBe('completed')
    expect(executeCalls).toHaveLength(1)
    expect(executeCalls[0].originId).toBe('point-cw2')
    expect(executeCalls[0].options?.expectedDieValue).toBe(5)

    // cast: telemetry is attached as a non-enumerable property
    const telemetry = (result as any).__aiTelemetry
    expect(telemetry).toHaveLength(1)
    expect(telemetry[0].executedDieValue).toBe(5)
  })
})
