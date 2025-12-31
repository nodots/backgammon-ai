/**
 * GNU Hints ↔ CORE Moves Roundtrip Test (Issue #232)
 *
 * Verifies that the board encoding fix correctly aligns GNU hints with CORE moves.
 * The bug was that X and O arrays had opposite mirroring applied, causing
 * GNU to not see blocked points correctly.
 *
 * This test verifies:
 * 1. X and O arrays are encoded differently (the main fix)
 * 2. Hint positions are valid for the active player
 */

// Lazy load to handle native addon availability
let GnuBgHints: any
let gnubgAvailable = false

try {
  const gnubgModule = await import('@nodots-llc/gnubg-hints')
  GnuBgHints = gnubgModule.GnuBgHints
  gnubgAvailable = true
} catch {
  console.log('GNU BG hints native addon not available, skipping roundtrip tests')
}

const describeIfAvailable = gnubgAvailable ? describe : describe.skip

/**
 * Create a simple board for testing (matches gnubg-hints test pattern)
 */
function createSimpleBoard(checkerSetup: Array<{
  clockwisePosition: number
  color: 'white' | 'black'
  count: number
}>) {
  const points = Array.from({ length: 24 }, (_, i) => ({
    position: { clockwise: i + 1, counterclockwise: 24 - i },
    checkers: [] as Array<{ color: 'white' | 'black' }>
  }))

  for (const setup of checkerSetup) {
    const pointIndex = setup.clockwisePosition - 1
    for (let i = 0; i < setup.count; i++) {
      points[pointIndex].checkers.push({ color: setup.color })
    }
  }

  return {
    id: 'test-board',
    points,
    bar: {
      clockwise: { checkers: [] },
      counterclockwise: { checkers: [] }
    },
    off: {
      clockwise: { checkers: [] },
      counterclockwise: { checkers: [] }
    }
  }
}

describeIfAvailable('GNU Hints ↔ CORE Moves Roundtrip (Issue #232 Fix)', () => {
  beforeAll(async () => {
    if (gnubgAvailable) {
      await GnuBgHints.initialize()
    }
  })

  afterAll(() => {
    if (gnubgAvailable) {
      GnuBgHints.shutdown()
    }
  })

  describe('Board encoding verification', () => {
    it('should generate valid hints for CLOCKWISE player from starting position', async () => {
      // Standard starting position
      const board = createSimpleBoard([
        { clockwisePosition: 24, color: 'white', count: 2 },
        { clockwisePosition: 13, color: 'white', count: 5 },
        { clockwisePosition: 8, color: 'white', count: 3 },
        { clockwisePosition: 6, color: 'white', count: 5 },
        { clockwisePosition: 1, color: 'black', count: 2 },
        { clockwisePosition: 12, color: 'black', count: 5 },
        { clockwisePosition: 17, color: 'black', count: 3 },
        { clockwisePosition: 19, color: 'black', count: 5 },
      ])

      const hints = await GnuBgHints.getMoveHints(
        {
          board,
          dice: [3, 1] as [number, number],
          activePlayerColor: 'white',
          activePlayerDirection: 'clockwise',
          cubeValue: 1,
          cubeOwner: null,
          matchScore: [0, 0] as [number, number],
          matchLength: 7,
          crawford: false,
          jacoby: false,
          beavers: false,
        },
        5
      )

      expect(hints.length).toBeGreaterThan(0)

      // All moves should be from positions where white has checkers
      const whitePositions = [24, 13, 8, 6]
      for (const hint of hints) {
        for (const move of hint.moves) {
          if (move.from > 0 && move.from <= 24) {
            expect(whitePositions).toContain(move.from)
          }
        }
      }
    })

    it('should generate valid hints for COUNTERCLOCKWISE player from starting position', async () => {
      // Standard starting position - black on roll (counterclockwise)
      const board = createSimpleBoard([
        { clockwisePosition: 24, color: 'white', count: 2 },
        { clockwisePosition: 13, color: 'white', count: 5 },
        { clockwisePosition: 8, color: 'white', count: 3 },
        { clockwisePosition: 6, color: 'white', count: 5 },
        { clockwisePosition: 1, color: 'black', count: 2 },
        { clockwisePosition: 12, color: 'black', count: 5 },
        { clockwisePosition: 17, color: 'black', count: 3 },
        { clockwisePosition: 19, color: 'black', count: 5 },
      ])

      const hints = await GnuBgHints.getMoveHints(
        {
          board,
          dice: [3, 1] as [number, number],
          activePlayerColor: 'black',
          activePlayerDirection: 'counterclockwise',
          cubeValue: 1,
          cubeOwner: null,
          matchScore: [0, 0] as [number, number],
          matchLength: 7,
          crawford: false,
          jacoby: false,
          beavers: false,
        },
        5
      )

      expect(hints.length).toBeGreaterThan(0)

      // All moves should be from positions where black has checkers (in counterclockwise coords)
      // Black positions in ccw: 24, 13, 8, 6 (cw 1, 12, 17, 19)
      const blackPositionsCCW = [24, 13, 8, 6]
      for (const hint of hints) {
        for (const move of hint.moves) {
          if (move.from > 0 && move.from <= 24) {
            expect(blackPositionsCCW).toContain(move.from)
          }
        }
      }
    })
  })

  describe('Die value consistency', () => {
    it('should have move distances matching die values', async () => {
      const board = createSimpleBoard([
        { clockwisePosition: 6, color: 'white', count: 5 },
        { clockwisePosition: 8, color: 'white', count: 3 },
        { clockwisePosition: 13, color: 'white', count: 5 },
        { clockwisePosition: 24, color: 'white', count: 2 },
        { clockwisePosition: 1, color: 'black', count: 2 },
        { clockwisePosition: 12, color: 'black', count: 5 },
        { clockwisePosition: 17, color: 'black', count: 3 },
        { clockwisePosition: 19, color: 'black', count: 5 },
      ])

      const hints = await GnuBgHints.getMoveHints(
        {
          board,
          dice: [5, 2] as [number, number],
          activePlayerColor: 'white',
          activePlayerDirection: 'clockwise',
          cubeValue: 1,
          cubeOwner: null,
          matchScore: [0, 0] as [number, number],
          matchLength: 7,
          crawford: false,
          jacoby: false,
          beavers: false,
        },
        5
      )

      expect(hints.length).toBeGreaterThan(0)

      // Each point-to-point move should have distance matching dice (5 or 2)
      for (const hint of hints) {
        for (const move of hint.moves) {
          if (move.moveKind === 'point-to-point' && move.from > 0 && move.to > 0) {
            const distance = move.from - move.to
            expect([5, 2]).toContain(distance)
          }
        }
      }
    })
  })
})
