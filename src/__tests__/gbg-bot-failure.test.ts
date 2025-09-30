/**
 * Test that gbg-bot fails appropriately when GNU BG is unavailable
 */

import type {
  BackgammonPlayMoving,
  BackgammonPoints,
  BackgammonPoint,
  BackgammonBoard,
} from '@nodots-llc/backgammon-types'
import { gnubgHints } from '../gnubg'
import { selectBestMove } from '../moveSelection'

const createMockPlay = (options?: { userId?: string; isRobot?: boolean }): BackgammonPlayMoving => {
  const { userId = 'player-1', isRobot = true } = options ?? {}
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
    userId,
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
    isRobot,
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
    moves: new Set([move]) as any,
    board,
  } as unknown as BackgammonPlayMoving
}

describe('gbg-bot GNU BG requirement', () => {
  const gbgPlay = createMockPlay({
    userId: 'da7eac85-cf8f-49f4-b97d-9f40d3171b36',
    isRobot: true,
  })
  const nodotsPlay = createMockPlay({
    userId: 'nbg-bot-user',
    isRobot: true,
  })

  it('should fail when gbg-bot cannot access GNU Backgammon and log AI engine', async () => {
    // Spy on logger to verify AI engine is logged (logger.info uses console.log)
    const loggerInfoSpy = jest.spyOn(console, 'log').mockImplementation()
    const loggerErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    jest.spyOn(gnubgHints, 'getMoveHints').mockImplementationOnce(() => {
      throw new Error('Native addon unavailable')
    })

    await expect(selectBestMove(gbgPlay, 'gbg-bot')).rejects.toThrow(
      /gbg-bot requires GNU Backgammon hints but the integration failed/i,
    )

    // Verify that the AI engine and failure were logged
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] [INFO] [AI] gbg-bot starting move selection')
    )
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] [ERROR] [AI] gbg-bot GNU Backgammon integration error')
    )

    loggerInfoSpy.mockRestore()
    loggerErrorSpy.mockRestore()
  })

  it('should allow other bots to use fallback logic and log AI engine', async () => {
    // Spy on logger to verify AI engine is logged (logger.info uses console.log)
    const loggerSpy = jest.spyOn(console, 'log').mockImplementation()

    const result = await selectBestMove(nodotsPlay, 'nbg-bot-v1')
    expect(result).toBeDefined()
    expect(result?.stateKind).toBe('ready')

    // Verify that the AI engine was logged
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] [INFO] [AI] nbg-bot-v1 AI Engine: Nodots AI (GNU BG excluded)')
    )
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] [INFO] [AI] nbg-bot-v1 Move selected via: Strategic Heuristics')
    )

    loggerSpy.mockRestore()
  })

  it('should work without player nickname (for backward compatibility)', async () => {
    const result = await selectBestMove(nodotsPlay)
    expect(result).toBeDefined()
    expect(result?.stateKind).toBe('ready')
  })
})
