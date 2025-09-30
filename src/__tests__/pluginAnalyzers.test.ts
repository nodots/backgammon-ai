import path from 'path'
import type { MoveHint } from '@nodots-llc/gnubg-hints'
import { loadAnalyzersFromPluginsDir } from '../pluginLoader'

jest.mock('@nodots-llc/gnubg-hints')

const { __setMockHints } = jest.requireMock('@nodots-llc/gnubg-hints') as {
  __setMockHints: (hints: MoveHint[]) => void;
};

interface TestMove {
  id: string
  player: any
  dieValue: number
  stateKind: string
  moveKind: string
  origin?: { position: { clockwise: number; counterclockwise: number } }
}

describe('Plugin Analyzers', () => {
  const pluginsDir = path.join(__dirname, '../../plugins')
  const analyzers = loadAnalyzersFromPluginsDir(pluginsDir)

  const moves: TestMove[] = [
    {
      id: '1',
      player: {} as any,
      dieValue: 6,
      stateKind: 'ready',
      moveKind: 'point-to-point',
      origin: { position: { clockwise: 10, counterclockwise: 15 } },
    },
    {
      id: '2',
      player: {} as any,
      dieValue: 3,
      stateKind: 'ready',
      moveKind: 'point-to-point',
      origin: { position: { clockwise: 20, counterclockwise: 5 } },
    },
    {
      id: '3',
      player: {} as any,
      dieValue: 1,
      stateKind: 'ready',
      moveKind: 'point-to-point',
      origin: { position: { clockwise: 5, counterclockwise: 20 } },
    },
  ]

  beforeEach(() => {
    __setMockHints([])
  })

  it('randomMoveAnalyzer returns one of the moves', async () => {
    const move = await analyzers['randomMoveAnalyzer'].selectMove(moves as any)
    expect(moves).toContain(move)
  })

  it('furthestFromOffMoveAnalyzer returns the move with highest clockwise position', async () => {
    const move = await analyzers['furthestFromOffMoveAnalyzer'].selectMove(
      moves as any,
    )
    expect(move).toBe(moves[1])
  })

  it('examplePluginAnalyzer returns the first move', async () => {
    const move = await analyzers['examplePluginAnalyzer'].selectMove(moves as any)
    expect(move).toBe(moves[0])
  })

  it('gnubgMoveAnalyzer falls back to the first move when no hints are provided', async () => {
    const move = await analyzers['gnubgMoveAnalyzer'].selectMove(moves as any, {
      hintRequest: {
        board: { points: [], bar: {}, off: {} } as any,
        dice: [0, 0],
        cubeValue: 1,
        cubeOwner: null,
        matchScore: [0, 0],
        matchLength: 0,
        crawford: false,
        jacoby: false,
        beavers: false,
      },
    })
    expect(move).toBe(moves[0])
  })
})
