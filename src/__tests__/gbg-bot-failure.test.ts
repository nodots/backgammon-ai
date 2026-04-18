/**
 * Test that selectBestMove works as a heuristic selector
 * (GNU routing is now handled by the plugin registry, not selectBestMove)
 */

import type {
  BackgammonPlayMoving,
  BackgammonPoints,
  BackgammonPoint,
  BackgammonBoard,
} from '@nodots/backgammon-types'
import { jest } from '@jest/globals'
import { selectBestMove } from '../moveSelection'

const createMockPlay = (): BackgammonPlayMoving => {
  const points = Array.from({ length: 24 }, (_, index) => ({
    id: `pt-${index + 1}`,
    kind: 'point' as const,
    position: {
      clockwise: (index + 1) as any,
      counterclockwise: (24 - index) as any,
    },
    checkers: [],
  })) as unknown as BackgammonPoints

  const board: BackgammonBoard = {
    id: 'board-1',
    points,
    bar: {
      clockwise: {
        id: 'bar-cw',
        kind: 'bar',
        direction: 'clockwise',
        position: 'bar',
        checkers: [],
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
      clockwise: {
        id: 'off-cw',
        kind: 'off',
        direction: 'clockwise',
        position: 'off',
        checkers: [],
      },
      counterclockwise: {
        id: 'off-ccw',
        kind: 'off',
        direction: 'counterclockwise',
        position: 'off',
        checkers: [],
      },
    },
  }

  const player = {
    id: 'player-1',
    userId: 'test-user',
    color: 'white' as const,
    direction: 'clockwise' as const,
    stateKind: 'moving' as const,
    dice: {
      id: 'dice-1',
      color: 'white' as const,
      stateKind: 'rolled' as const,
      currentRoll: [3, 2] as [number, number],
      total: 5,
    },
    pipCount: 150,
    isRobot: true,
    rollForStartValue: 3 as any,
  }

  const move = {
    id: 'move-1',
    player,
    dieValue: 3,
    stateKind: 'ready' as const,
    moveKind: 'point-to-point' as const,
    origin: points[23] as BackgammonPoint,
    destination: points[20] as BackgammonPoint,
    possibleMoves: [
      {
        dieValue: 3,
        direction: 'clockwise',
        origin: points[23] as BackgammonPoint,
        destination: points[20] as BackgammonPoint,
      },
    ],
  }

  return {
    id: 'play-1',
    stateKind: 'moving',
    player,
    moves: [move],
    board,
  } as unknown as BackgammonPlayMoving
}

describe('selectBestMove heuristic selection', () => {
  it('should select a ready move using heuristics', async () => {
    const play = createMockPlay()
    const result = await selectBestMove(play)
    expect(result).toBeDefined()
    expect(result?.stateKind).toBe('ready')
  })

  it('should return undefined for empty moves', async () => {
    const play = createMockPlay()
    play.moves = [] as any
    const result = await selectBestMove(play)
    expect(result).toBeUndefined()
  })
})
