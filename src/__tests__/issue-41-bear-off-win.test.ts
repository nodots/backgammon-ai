/**
 * Regression for issue nodots/backgammon-ai#41
 *
 * In production game bf09273a-0f04-459a-bc9a-79dd94dcc80c the GNU Intermediate
 * robot threw away an immediate, trivial win on the final turn. Black had two
 * checkers in its home board (cw23/ccw2 and cw24/ccw1), 13 already off, and
 * rolled (1,4). The unique winning play is to bear off both. The robot
 * instead played die-1 as 2->1 (point-to-point) then die-4 as 1->off, leaving
 * one checker on the board.
 *
 * Root cause (verified locally with the real native addon): GNU returns two
 * hints with essentially-tied equity (~1.0 + float noise):
 *
 *   #0  equity=1.0000005   2->1 (point-to-point)  1->0 (bear-off)   <- slow
 *   #1  equity=0.9999995   1->0 (bear-off)        2->0 (bear-off)   <- wins
 *
 * The robot was blindly taking hints[0]. The fix in robotExecution.ts adds an
 * equity-tied tiebreaker that prefers the line with more bear-offs, which
 * matches the racing principle "off > pips" without overriding GNU's actual
 * judgment in non-tied positions.
 *
 * This test mocks the engine with the exact two-hint payload observed for
 * the production position and asserts that the AI executes the immediate-win
 * sequence.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

let plannedHints: any[] = []
let executeCalls: string[] = []
let currentReadyMoves: any[] = []

const initializeMock = jest.fn().mockResolvedValue(undefined)
const configureMock = jest.fn().mockResolvedValue(undefined)
const getHintsMock = jest.fn(() => Promise.resolve(plannedHints))

const executeAndRecalculateMock = jest.fn(
  (game: any, originId: string, _options?: any) => {
    executeCalls.push(originId)
    // Drop the matching ready move; if any ready remain, the loop continues.
    const remaining = ((game.activePlay?.moves || []) as any[]).filter(
      (m: any) =>
        !(m.possibleMoves || []).some((pm: any) => pm?.origin?.id === originId)
    )
    currentReadyMoves = remaining
    return {
      ...game,
      activePlay: { ...game.activePlay, moves: remaining },
      stateKind: remaining.length > 0 ? 'moving' : 'moved',
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
const exportToGnuPositionIdMock = jest.fn(() => 'rwcAABQAAAAAAA')

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

const buildBearOffGame = () => {
  // Black is counterclockwise. ccw2 has one checker, ccw1 has one checker.
  // GNU's `from`/`to` for black are in counterclockwise position numbers.
  const point2 = {
    id: 'point-ccw2',
    kind: 'point',
    position: { clockwise: 23, counterclockwise: 2 },
    checkers: [{ color: 'black' }],
  }
  const point1 = {
    id: 'point-ccw1',
    kind: 'point',
    position: { clockwise: 24, counterclockwise: 1 },
    checkers: [{ color: 'black' }],
  }
  const offCcw = { id: 'off-ccw', kind: 'off', checkers: [] }
  const offCw = { id: 'off-cw', kind: 'off', checkers: [] }

  const die1Move = {
    id: 'm-die1',
    stateKind: 'ready',
    moveKind: 'point-to-point',
    dieValue: 1,
    possibleMoves: [
      {
        // 2 -> 1 (the slow option)
        origin: point2,
        destination: point1,
        dieValue: 1,
      },
      {
        // 1 -> off (bear off the 1-point)
        origin: point1,
        destination: offCcw,
        dieValue: 1,
      },
    ],
  }
  const die4Move = {
    id: 'm-die4',
    stateKind: 'ready',
    moveKind: 'bear-off',
    dieValue: 4,
    possibleMoves: [
      {
        // 2 -> off (overshoot bear off the 2-point)
        origin: point2,
        destination: offCcw,
        dieValue: 4,
      },
    ],
  }

  const activePlayer = {
    id: 'player-black',
    color: 'black',
    direction: 'counterclockwise',
    stateKind: 'moving',
    isRobot: true,
    dice: { stateKind: 'rolled', currentRoll: [1, 4] },
  }

  currentReadyMoves = [die1Move, die4Move]

  return {
    id: 'game-issue-41',
    stateKind: 'moving',
    board: {
      id: 'board-1',
      points: Array.from({ length: 24 }, (_, i) => {
        if (i + 1 === 23) return point2
        if (i + 1 === 24) return point1
        return {
          id: `point-${i + 1}`,
          kind: 'point',
          position: { clockwise: i + 1, counterclockwise: 24 - i },
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
      moves: [die1Move, die4Move],
    },
    players: [activePlayer],
  }
}

beforeEach(() => {
  plannedHints = []
  executeCalls = []
  currentReadyMoves = []
  executeAndRecalculateMock.mockClear()
  handleRobotMovedStateMock.mockClear()
})

describe('issue #41: GNU equity-tie tiebreaker prefers immediate-win line', () => {
  it('picks the bear-off-both line over an equity-tied 2->1 then 1->off line', async () => {
    // The exact ordering observed from the real native addon for position
    // rwcAABQAAAAAAA with roll [1,4]: hints[0] is the slow line, hints[1]
    // wins immediately. Equities are within float-precision noise of 1.0.
    plannedHints = [
      {
        equity: 1.0000004768371582,
        moves: [
          { from: 2, to: 1, moveKind: 'point-to-point', player: 'black' },
          { from: 1, to: 0, moveKind: 'bear-off', player: 'black' },
        ],
      },
      {
        equity: 0.9999995231628418,
        moves: [
          { from: 1, to: 0, moveKind: 'bear-off', player: 'black' },
          { from: 2, to: 0, moveKind: 'bear-off', player: 'black' },
        ],
      },
    ]

    const game = buildBearOffGame()

    await executeRobotTurnWithGNU(game as any)

    // Both executed steps should be bear-offs, not the point-to-point 2->1.
    expect(executeCalls).toHaveLength(2)
    expect(executeCalls).toContain('point-ccw2') // 2 -> off
    expect(executeCalls).toContain('point-ccw1') // 1 -> off
  })

  it('still follows hints[0] when no other hint is within equity tolerance', async () => {
    // If GNU genuinely prefers a non-bear-off line (equities far apart), the
    // tiebreaker must NOT override its judgment.
    plannedHints = [
      {
        equity: 0.5,
        moves: [
          { from: 2, to: 1, moveKind: 'point-to-point', player: 'black' },
          { from: 1, to: 0, moveKind: 'bear-off', player: 'black' },
        ],
      },
      {
        equity: 0.2,
        moves: [
          { from: 1, to: 0, moveKind: 'bear-off', player: 'black' },
          { from: 2, to: 0, moveKind: 'bear-off', player: 'black' },
        ],
      },
    ]

    const game = buildBearOffGame()

    await executeRobotTurnWithGNU(game as any)

    // First step is the point-to-point 2->1 -> origin id is point-ccw2 with
    // destination point-ccw1.
    expect(executeCalls[0]).toBe('point-ccw2')
  })
})
