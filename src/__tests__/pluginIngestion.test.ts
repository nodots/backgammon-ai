import fs from 'fs'
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
  origin: { position: { clockwise: number; counterclockwise: number } }
}

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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginsDir = path.join(__dirname, '../../plugins')

const loadableFiles = fs
  .readdirSync(pluginsDir)
  .filter((f) => /\.(ts|js|mjs|cjs)$/.test(f))

describe('Plugin ingestion', () => {
  let analyzers: Record<string, any> = {}

  beforeAll(async () => {
    analyzers = await loadAnalyzersFromPluginsDir(pluginsDir)
  })

  beforeEach(() => {
    mockHints = []
    getMoveHintsMock.mockClear()
  })

  it('ingests every file in plugins/ as a keyed analyzer', () => {
    const expectedKeys = loadableFiles
      .map((f) => path.basename(f, path.extname(f)))
      .sort()
    expect(Object.keys(analyzers).sort()).toEqual(expectedKeys)
  })

  it.each(loadableFiles.map((f) => path.basename(f, path.extname(f))))(
    '%s conforms to the MoveAnalyzer interface',
    (key) => {
      const analyzer = analyzers[key]
      expect(analyzer).toBeDefined()
      expect(typeof analyzer.selectMove).toBe('function')
    },
  )

  it.each(loadableFiles.map((f) => path.basename(f, path.extname(f))))(
    '%s returns null on empty input',
    async (key) => {
      const result = await analyzers[key].selectMove([], {
        positionId: '4HPwATDgc/ABMA',
      })
      expect(result).toBeNull()
    },
  )

  it.each(loadableFiles.map((f) => path.basename(f, path.extname(f))))(
    '%s returns an element of the input set',
    async (key) => {
      const result = await analyzers[key].selectMove(moves as any, {
        positionId: '4HPwATDgc/ABMA',
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
      expect(moves).toContain(result)
    },
  )
})
