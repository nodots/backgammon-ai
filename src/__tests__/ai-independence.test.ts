/**
 * AI independence — analyzers must not consume dice entropy.
 *
 * The invariant:
 *   Move selection reads the legal-move set and the board; it does not
 *   roll dice. An analyzer that calls Dice.rollDie during selection
 *   either (a) peeks at an upcoming opponent roll, or (b) advances the
 *   RNG in a way that biases subsequent game rolls. Both are regressions
 *   against the fairness story in Paper 12.
 *
 * This test spies on Dice.rollDie from @nodots/backgammon-core and
 * asserts every shipped analyzer leaves it untouched during selectMove.
 * The test is deliberately defensive: no current analyzer calls rollDie.
 * The purpose is to catch the regression at the moment a new analyzer
 * introduces one.
 */
import path from 'path'
import { jest } from '@jest/globals'
import { fileURLToPath } from 'url'
import type { MoveHint } from '@nodots/gnubg-hints'

let mockHints: MoveHint[] = []
jest.unstable_mockModule('@nodots/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: jest.fn().mockResolvedValue(undefined),
    configure: jest.fn(),
    getMoveHints: jest.fn(async () => mockHints),
    getDoubleHint: jest.fn(),
    getTakeHint: jest.fn(),
    shutdown: jest.fn(),
  },
}))

const { loadAnalyzersFromPluginsDir } = await import('../pluginLoader.js')
const { Dice } = await import('@nodots/backgammon-core/dist/Dice/index.js')

const moves = [
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

const hintRequest = {
  board: { points: [], bar: {}, off: {} } as any,
  dice: [6, 3] as [number, number],
  cubeValue: 1,
  cubeOwner: null,
  matchScore: [0, 0] as [number, number],
  matchLength: 0,
  crawford: false,
  jacoby: false,
  beavers: false,
}

describe('AI independence — analyzers do not consume dice entropy', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const pluginsDir = path.join(__dirname, '../../plugins')
  let analyzers: Record<string, any> = {}
  let rollDieSpy: ReturnType<typeof jest.spyOn>

  beforeAll(async () => {
    analyzers = await loadAnalyzersFromPluginsDir(pluginsDir)
  })

  beforeEach(() => {
    rollDieSpy = jest.spyOn(Dice, 'rollDie')
  })

  afterEach(() => {
    rollDieSpy.mockRestore()
  })

  const shippedAnalyzers = [
    'randomMoveAnalyzer',
    'furthestFromOffMoveAnalyzer',
    'nodotsAIMoveAnalyzer',
    'examplePluginAnalyzer',
    'gnubgMoveAnalyzer',
  ]

  it.each(shippedAnalyzers)(
    '%s.selectMove does not call Dice.rollDie',
    async (analyzerName) => {
      const analyzer = analyzers[analyzerName]
      expect(analyzer).toBeDefined()

      await analyzer.selectMove(moves as any, {
        hintRequest,
        positionId: '4HPwATDgc/ABMA',
      })

      expect(rollDieSpy).not.toHaveBeenCalled()
    }
  )

  it('baseline sanity — the spy fires when Dice.rollDie is called directly', () => {
    Dice.rollDie()
    expect(rollDieSpy).toHaveBeenCalledTimes(1)
  })
})
