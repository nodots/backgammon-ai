/**
 * Test that gbg-bot fails appropriately when GNU BG is unavailable
 */

import { selectBestMove } from '../moveSelection'

describe('gbg-bot GNU BG requirement', () => {
  const mockPlay = {
    stateKind: 'moving',
    moves: new Set([
      {
        stateKind: 'ready',
        dieValue: 3,
        possibleMoves: [
          {
            origin: { kind: 'point', position: { clockwise: 24, counterclockwise: 1 }, checkers: [{ id: 'checker1', color: 'white' }] },
            destination: { kind: 'point', position: { clockwise: 21, counterclockwise: 4 }, checkers: [] }
          }
        ]
      }
    ])
  } as any

  it('should fail when gbg-bot cannot access GNU Backgammon and log AI engine', async () => {
    // Spy on logger to verify AI engine is logged
    const loggerInfoSpy = jest.spyOn(console, 'info').mockImplementation()
    const loggerErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    
    await expect(selectBestMove(mockPlay, 'gbg-bot'))
      .rejects
      .toThrow(/gbg-bot requires GNU Backgammon integration/)
    
    // Verify that the AI engine and failure were logged
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] gbg-bot starting move selection')
    )
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] gbg-bot GNU Backgammon integration incomplete')
    )
    
    loggerInfoSpy.mockRestore()
    loggerErrorSpy.mockRestore()
  })

  it('should allow other bots to use fallback logic and log AI engine', async () => {
    // Spy on logger to verify AI engine is logged
    const loggerSpy = jest.spyOn(console, 'info').mockImplementation()
    
    const result = await selectBestMove(mockPlay, 'nbg-bot-v1')
    expect(result).toBeDefined()
    expect(result?.stateKind).toBe('ready')
    
    // Verify that the AI engine was logged
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] nbg-bot-v1 AI Engine: Hybrid (Opening Book + Strategic Heuristics)')
    )
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AI] nbg-bot-v1 Move selected via: Strategic Heuristics')
    )
    
    loggerSpy.mockRestore()
  })

  it('should work without player nickname (for backward compatibility)', async () => {
    const result = await selectBestMove(mockPlay)
    expect(result).toBeDefined()
    expect(result?.stateKind).toBe('ready')
  })
})