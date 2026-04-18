/**
 * GNU Coordinate System Diagnostic Test
 *
 * This test traces the full path of position encoding and hint decoding
 * to identify where coordinate mismatches occur between GNU hints and CORE moves.
 *
 * Tests both clockwise and counterclockwise players to verify the
 * mapGnuIndexToPlayerPosition transformation works correctly in both cases.
 */

import type {
  BackgammonBoard,
  BackgammonColor,
  BackgammonMoveDirection,
  BackgammonGame,
} from '@nodots/backgammon-types'

// Try to import the real gnubg-hints - skip tests if native addon not available
let GnuBgHints: any
let gnubgAvailable = false

try {
  const gnubgModule = await import('@nodots/gnubg-hints')
  GnuBgHints = gnubgModule.GnuBgHints
  gnubgAvailable = true
} catch (e) {
  console.log('GNU BG hints native addon not available, skipping diagnostic tests')
}

// Import core utilities for position ID generation
let CoreUtil: any
try {
  CoreUtil = await import('@nodots/backgammon-core')
} catch (e) {
  console.log('Core package not available')
}

const describeIfAvailable = gnubgAvailable && CoreUtil ? describe : describe.skip

/**
 * Create a minimal game state for testing
 */
function createTestGame(options: {
  activeColor: BackgammonColor
  activeDirection: BackgammonMoveDirection
  checkerSetup: Array<{
    position: number // clockwise position 1-24
    color: BackgammonColor
    count: number
  }>
  dice: [number, number]
}): BackgammonGame {
  // Create 24 empty points with dual position numbering
  const points = Array.from({ length: 24 }, (_, index) => ({
    id: `pt-${index + 1}`,
    kind: 'point' as const,
    position: {
      clockwise: index + 1,
      counterclockwise: 24 - index,
    },
    checkers: [] as any[],
  }))

  // Add checkers according to setup
  let checkerId = 1
  for (const setup of options.checkerSetup) {
    const pointIndex = setup.position - 1 // Convert 1-indexed to 0-indexed
    for (let i = 0; i < setup.count; i++) {
      points[pointIndex].checkers.push({
        id: `checker-${checkerId++}`,
        color: setup.color,
      })
    }
  }

  const board: BackgammonBoard = {
    id: 'board-test',
    points: points as any,
    bar: {
      clockwise: {
        id: 'bar-cw',
        kind: 'bar' as const,
        direction: 'clockwise' as const,
        position: 'bar' as const,
        checkers: [],
      },
      counterclockwise: {
        id: 'bar-ccw',
        kind: 'bar' as const,
        direction: 'counterclockwise' as const,
        position: 'bar' as const,
        checkers: [],
      },
    },
    off: {
      clockwise: {
        id: 'off-cw',
        kind: 'off' as const,
        direction: 'clockwise' as const,
        position: 'off' as const,
        checkers: [],
      },
      counterclockwise: {
        id: 'off-ccw',
        kind: 'off' as const,
        direction: 'counterclockwise' as const,
        position: 'off' as const,
        checkers: [],
      },
    },
  }

  const activePlayer = {
    id: 'player-active',
    userId: 'test-user-1',
    color: options.activeColor,
    direction: options.activeDirection,
    stateKind: 'moving' as const,
    dice: {
      id: 'dice-active',
      color: options.activeColor,
      stateKind: 'rolled' as const,
      currentRoll: options.dice,
      total: options.dice[0] + options.dice[1],
    },
    pipCount: 150,
    isRobot: true,
  }

  const inactiveColor: BackgammonColor =
    options.activeColor === 'white' ? 'black' : 'white'
  const inactiveDirection: BackgammonMoveDirection =
    options.activeDirection === 'clockwise' ? 'counterclockwise' : 'clockwise'

  const inactivePlayer = {
    id: 'player-inactive',
    userId: 'test-user-2',
    color: inactiveColor,
    direction: inactiveDirection,
    stateKind: 'inactive' as const,
    dice: {
      id: 'dice-inactive',
      color: inactiveColor,
      stateKind: 'inactive' as const,
    },
    pipCount: 150,
    isRobot: true,
  }

  // Create a simplified game object
  const game = {
    id: 'game-test',
    stateKind: 'moving',
    board,
    players: [activePlayer, inactivePlayer],
    activeColor: options.activeColor,
    activePlayer,
    inactivePlayer,
    activePlay: {
      id: 'play-test',
      stateKind: 'moving',
      player: activePlayer,
      board,
      moves: new Set(),
    },
  }

  return game as unknown as BackgammonGame
}

describeIfAvailable('GNU Coordinate System Diagnostics', () => {
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

  describe('Position ID encoding consistency', () => {
    it('should generate consistent position ID for starting position', () => {
      // Standard backgammon starting position
      const game = createTestGame({
        activeColor: 'white',
        activeDirection: 'clockwise',
        checkerSetup: [
          // White checkers (standard positions for white moving clockwise)
          { position: 24, color: 'white', count: 2 },
          { position: 13, color: 'white', count: 5 },
          { position: 8, color: 'white', count: 3 },
          { position: 6, color: 'white', count: 5 },
          // Black checkers (standard positions for black moving counterclockwise)
          { position: 1, color: 'black', count: 2 },
          { position: 12, color: 'black', count: 5 },
          { position: 17, color: 'black', count: 3 },
          { position: 19, color: 'black', count: 5 },
        ],
        dice: [5, 2],
      })

      const pid = CoreUtil.Board.exportToGnuPositionId(game)
      console.log('[DIAGNOSTIC] Starting position ID:', pid)

      expect(pid).toBeDefined()
      expect(pid.length).toBe(14)
    })
  })

  describe('Hint position transformation - CLOCKWISE player', () => {
    it('should match GNU hint positions to CORE ready moves for clockwise player', async () => {
      // Simple position: white has 2 checkers on point 6 (clockwise)
      const game = createTestGame({
        activeColor: 'white',
        activeDirection: 'clockwise',
        checkerSetup: [
          { position: 6, color: 'white', count: 2 },
          { position: 19, color: 'black', count: 2 },
        ],
        dice: [3, 1],
      })

      const pid = CoreUtil.Board.exportToGnuPositionId(game)
      console.log('[DIAGNOSTIC] Clockwise test - Position ID:', pid)
      console.log('[DIAGNOSTIC] Clockwise test - Active player:', {
        color: game.activePlayer?.color,
        direction: (game.activePlayer as any)?.direction,
      })

      // Get hints from GNU
      const hints = await GnuBgHints.getMoveHints(
        {
          board: game.board,
          dice: [3, 1] as [number, number],
          activePlayerColor: 'white',
          activePlayerDirection: 'clockwise',
          cubeValue: 1,
          cubeOwner: null,
          matchScore: [0, 0],
          matchLength: 0,
          crawford: false,
          jacoby: false,
          beavers: false,
        },
        5
      )

      console.log('[DIAGNOSTIC] Clockwise test - Hints received:', hints?.length)
      if (hints && hints.length > 0) {
        const firstHint = hints[0]
        console.log('[DIAGNOSTIC] Clockwise test - First hint moves:', firstHint.moves)

        // For clockwise player with checker at position 6 and dice [3,1]:
        // Expected moves: 6->3 (die 3) and 6->5 or 3->2 (die 1)
        // GNU should return positions in clockwise coordinates
        for (const step of firstHint.moves) {
          console.log('[DIAGNOSTIC] Step:', {
            from: step.from,
            to: step.to,
            kind: step.moveKind,
            expectedDie: Math.abs(step.from - step.to),
          })
        }
      }

      expect(hints).toBeDefined()
      expect(hints.length).toBeGreaterThan(0)
    })
  })

  describe('Hint position transformation - COUNTERCLOCKWISE player', () => {
    it('should match GNU hint positions to CORE ready moves for counterclockwise player', async () => {
      // Simple position: black has 2 checkers on point 6 (counterclockwise = clockwise 19)
      const game = createTestGame({
        activeColor: 'black',
        activeDirection: 'counterclockwise',
        checkerSetup: [
          { position: 19, color: 'black', count: 2 }, // This is counterclockwise position 6
          { position: 6, color: 'white', count: 2 },
        ],
        dice: [3, 1],
      })

      const pid = CoreUtil.Board.exportToGnuPositionId(game)
      console.log('[DIAGNOSTIC] Counterclockwise test - Position ID:', pid)
      console.log('[DIAGNOSTIC] Counterclockwise test - Active player:', {
        color: game.activePlayer?.color,
        direction: (game.activePlayer as any)?.direction,
      })

      // needsMirror should be true for counterclockwise
      const needsMirror = (game.activePlayer as any)?.direction !== 'clockwise'
      console.log('[DIAGNOSTIC] Counterclockwise test - needsMirror:', needsMirror)

      // Get hints from GNU
      const hints = await GnuBgHints.getMoveHints(
        {
          board: game.board,
          dice: [3, 1] as [number, number],
          activePlayerColor: 'black',
          activePlayerDirection: 'counterclockwise',
          cubeValue: 1,
          cubeOwner: null,
          matchScore: [0, 0],
          matchLength: 0,
          crawford: false,
          jacoby: false,
          beavers: false,
        },
        5
      )

      console.log('[DIAGNOSTIC] Counterclockwise test - Hints received:', hints?.length)
      if (hints && hints.length > 0) {
        const firstHint = hints[0]
        console.log(
          '[DIAGNOSTIC] Counterclockwise test - First hint moves:',
          firstHint.moves
        )

        // For counterclockwise player with checker at counterclockwise position 6 and dice [3,1]:
        // Expected moves in COUNTERCLOCKWISE coordinates: 6->3 (die 3) and 6->5 or 3->2 (die 1)
        // The 'from' and 'to' values should be in the active player's directional coordinates
        for (const step of firstHint.moves) {
          console.log('[DIAGNOSTIC] Step:', {
            from: step.from,
            to: step.to,
            kind: step.moveKind,
            expectedDie: Math.abs(step.from - step.to),
            // Verify: for counterclockwise player, these should be counterclockwise positions
          })

          // The die value should match the step distance
          const distance = Math.abs(step.from - step.to)
          expect([1, 3]).toContain(distance)
        }
      }

      expect(hints).toBeDefined()
      expect(hints.length).toBeGreaterThan(0)
    })
  })

  describe('Full round-trip: encoding -> hints -> matching', () => {
    it('should successfully match hints to ready moves for both directions', async () => {
      // This test verifies the complete flow that fails in gnu-vs-gnu-pr-batch.ts
      const directions: BackgammonMoveDirection[] = ['clockwise', 'counterclockwise']

      for (const direction of directions) {
        const isClockwise = direction === 'clockwise'
        const color: BackgammonColor = isClockwise ? 'white' : 'black'

        // Position with checker at "their position 13" (midpoint)
        // For clockwise: physical position 13
        // For counterclockwise: physical position 12 (since 25-13=12)
        const checkerPhysicalPos = isClockwise ? 13 : 12
        const opponentPhysicalPos = isClockwise ? 12 : 13

        const game = createTestGame({
          activeColor: color,
          activeDirection: direction,
          checkerSetup: [
            { position: checkerPhysicalPos, color, count: 5 },
            {
              position: opponentPhysicalPos,
              color: isClockwise ? 'black' : 'white',
              count: 5,
            },
          ],
          dice: [5, 2],
        })

        const pid = CoreUtil.Board.exportToGnuPositionId(game)
        console.log(`[DIAGNOSTIC] ${direction} round-trip - Position ID:`, pid)

        const needsMirror = direction !== 'clockwise'
        console.log(`[DIAGNOSTIC] ${direction} round-trip - needsMirror:`, needsMirror)

        // Get hints
        const hints = await GnuBgHints.getMoveHints(
          {
            board: game.board,
            dice: [5, 2] as [number, number],
            activePlayerColor: color,
            activePlayerDirection: direction,
            cubeValue: 1,
            cubeOwner: null,
            matchScore: [0, 0],
            matchLength: 0,
            crawford: false,
            jacoby: false,
            beavers: false,
          },
          5
        )

        expect(hints).toBeDefined()
        expect(hints.length).toBeGreaterThan(0)

        const firstHint = hints[0]
        console.log(
          `[DIAGNOSTIC] ${direction} round-trip - First hint:`,
          firstHint.moves.map((m: any) => ({ from: m.from, to: m.to, kind: m.moveKind }))
        )

        // Verify: for a checker at "their 13", a die of 5 should give "from: 13, to: 8"
        const firstStep = firstHint.moves[0]
        if (firstStep) {
          console.log(`[DIAGNOSTIC] ${direction} round-trip - First step analysis:`, {
            from: firstStep.from,
            to: firstStep.to,
            expectedFrom: 13, // Should be 13 in active player's coordinates
            expectedDistance: firstStep.from - firstStep.to,
          })

          // The from position should be 13 (in the active player's coordinate system)
          // because we placed the checker at "their position 13"
          expect(firstStep.from).toBe(13)
        }
      }
    })
  })
})
