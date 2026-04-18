import path from 'path'
import { jest } from '@jest/globals'
import type { MoveHint } from '@nodots/gnubg-hints'
import { fileURLToPath } from 'url'

let mockHints: MoveHint[] = []
const initializeMock = jest.fn().mockResolvedValue(undefined)
const getMoveHintsMock = jest.fn(async () => mockHints)

jest.unstable_mockModule('@nodots/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    configure: jest.fn(),
    getMoveHints: getMoveHintsMock,
    getDoubleHint: jest.fn(),
    getTakeHint: jest.fn(),
    shutdown: jest.fn(),
  },
}))

const { loadAnalyzersFromPluginsDir } = await import('../pluginLoader.js')

interface TestMove {
  id: string
  player: any
  dieValue: number
  stateKind: string
  moveKind: string
  origin?: { position: { clockwise: number; counterclockwise: number } }
}

describe('Plugin Analyzers', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const pluginsDir = path.join(__dirname, '../../plugins')
  let analyzers: Record<string, any> = {}

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

  beforeAll(async () => {
    analyzers = await loadAnalyzersFromPluginsDir(pluginsDir)
  })

  beforeEach(() => {
    mockHints = []
    getMoveHintsMock.mockClear()
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
