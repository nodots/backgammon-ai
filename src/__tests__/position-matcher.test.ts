/**
 * Unit tests for position-based move matching
 *
 * Tests the matchStepToReadyMove function which is the canonical matcher
 * for mapping GNU hint steps to CORE READY moves.
 */

import type { MoveStep } from '@nodots-llc/gnubg-hints'
import type { BackgammonMoveDirection, BackgammonColor } from '@nodots-llc/backgammon-types'

// Import the matching function
import { matchStepToReadyMove, PositionMatchResult } from '../robotExecution.js'

// Helper to create a MoveStep with all required fields
const createMoveStep = (
  from: number,
  to: number,
  moveKind: 'point-to-point' | 'reenter' | 'bear-off',
  player: BackgammonColor = 'black',
  isHit = false
): MoveStep => {
  const fromContainer = moveKind === 'reenter' ? 'bar' : 'point'
  const toContainer = moveKind === 'bear-off' ? 'off' : 'point'
  return {
    from,
    to,
    moveKind,
    player,
    isHit,
    fromContainer,
    toContainer,
  }
}

describe('Position-based move matching', () => {
  // Helper to create mock ready moves
  const createReadyMove = (
    originId: string,
    originPos: number | null,
    destinationPos: number | null,
    kind: 'point' | 'bar' | 'off',
    dieValue: number,
    direction: BackgammonMoveDirection = 'clockwise'
  ) => ({
    stateKind: 'ready',
    dieValue,
    moveKind: kind === 'bar' ? 'reenter' : kind === 'off' ? 'bear-off' : 'point-to-point',
    possibleMoves: [
      {
        origin: {
          id: originId,
          kind: kind === 'bar' ? 'bar' : 'point',
          position: originPos !== null ? { [direction]: originPos } : undefined,
        },
        destination: {
          id: `dest-${originId}`,
          kind: kind === 'off' ? 'off' : 'point',
          position: destinationPos !== null ? { [direction]: destinationPos } : undefined,
        },
        dieValue,
        isHit: false,
      },
    ],
  })

  describe('Point-to-point matching', () => {
    it('matches by ID when available', () => {
      const step = createMoveStep(13, 7, 'point-to-point')
      const readyMoves = [
        createReadyMove('point-13', 13, 7, 'point', 6),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', 'point-13')

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('point-13')
      expect(result.matchStrategy).toBe('id')
    })

    it('matches by position when ID does not match', () => {
      const step = createMoveStep(13, 7, 'point-to-point')
      const readyMoves = [
        createReadyMove('different-id', 13, 7, 'point', 6),
      ]

      // Pass a non-matching ID to force position-based matching
      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', 'wrong-id')

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('different-id')
      expect(result.matchStrategy).toBe('position')
      expect(result.expectedDie).toBe(6)
      expect(result.matchedDie).toBe(6)
    })

    it('fails when die values do not match for point-to-point', () => {
      const step = createMoveStep(13, 7, 'point-to-point')
      const readyMoves = [
        createReadyMove('point-13', 13, 7, 'point', 5), // Die value 5, but position requires 6
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(false)
      expect(result.matchStrategy).toBe('none')
    })

    it('fails when positions do not match', () => {
      const step = createMoveStep(13, 7, 'point-to-point')
      const readyMoves = [
        createReadyMove('point-12', 12, 6, 'point', 6),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(false)
    })
  })

  describe('Bar reentry matching', () => {
    it('matches bar reentry by destination position with die=1 (to=24)', () => {
      // For reentry: die = 25 - to, so to=24 means die=1
      const step = createMoveStep(25, 24, 'reenter') // GNU bar position is 25, entering at point 24
      const readyMoves = [
        createReadyMove('bar-black', null, 24, 'bar', 1), // die=1 enters at point 24
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('bar-black')
      expect(result.matchStrategy).toBe('position')
      expect(result.expectedDie).toBe(1) // 25 - 24 = 1
    })

    it('matches bar reentry by destination position with die=6 (to=19)', () => {
      // For reentry: die = 25 - to, so to=19 means die=6
      const step = createMoveStep(25, 19, 'reenter') // entering at point 19
      const readyMoves = [
        createReadyMove('bar-black', null, 19, 'bar', 6), // die=6 enters at point 19
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('bar-black')
      expect(result.matchStrategy).toBe('position')
      expect(result.expectedDie).toBe(6) // 25 - 19 = 6
    })

    it('fails when die value does not match destination for reentry', () => {
      // to=24 means die=1, but ready move has die=5
      const step = createMoveStep(25, 24, 'reenter')
      const readyMoves = [
        createReadyMove('bar-black', null, 24, 'bar', 5), // Wrong die value (should be 1)
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(false)
    })
  })

  describe('Bear-off matching', () => {
    it('matches bear-off by origin position', () => {
      const step = createMoveStep(3, 0, 'bear-off') // GNU off position is 0
      const readyMoves = [
        createReadyMove('point-3', 3, null, 'off', 3),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('point-3')
      expect(result.matchStrategy).toBe('position')
      expect(result.expectedDie).toBe(3)
    })

    it('allows higher die for bear-off when no higher checkers', () => {
      const step = createMoveStep(3, 0, 'bear-off')
      const readyMoves = [
        // Die value 5 is allowed to bear off from position 3 when no higher checkers
        createReadyMove('point-3', 3, null, 'off', 5),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(true)
      expect(result.expectedDie).toBe(3)
      expect(result.matchedDie).toBe(5)
    })

    it('fails when die value is less than position for bear-off', () => {
      const step = createMoveStep(5, 0, 'bear-off')
      const readyMoves = [
        // Die value 3 is not enough to bear off from position 5
        createReadyMove('point-5', 5, null, 'off', 3),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(false)
    })
  })

  describe('Direction handling', () => {
    it('matches using counterclockwise direction', () => {
      const step = createMoveStep(13, 10, 'point-to-point', 'white')
      const readyMoves = [
        {
          stateKind: 'ready',
          dieValue: 3,
          moveKind: 'point-to-point',
          possibleMoves: [
            {
              origin: {
                id: 'point-counterclockwise-13',
                kind: 'point',
                position: { counterclockwise: 13 },
              },
              destination: {
                id: 'point-counterclockwise-10',
                kind: 'point',
                position: { counterclockwise: 10 },
              },
              dieValue: 3,
              isHit: false,
            },
          ],
        },
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'counterclockwise', null)

      expect(result.matched).toBe(true)
      expect(result.matchStrategy).toBe('position')
    })
  })

  describe('Edge cases', () => {
    it('returns no match for empty ready moves', () => {
      const step = createMoveStep(13, 7, 'point-to-point')

      const result = matchStepToReadyMove(step, [], 'clockwise', null)

      expect(result.matched).toBe(false)
      expect(result.matchStrategy).toBe('none')
    })

    it('handles moves without possibleMoves array', () => {
      const step = createMoveStep(13, 7, 'point-to-point')
      const readyMoves = [
        { stateKind: 'ready', dieValue: 6, possibleMoves: null },
      ]

      const result = matchStepToReadyMove(step, readyMoves as any, 'clockwise', null)

      expect(result.matched).toBe(false)
    })

    it('handles multiple ready moves and finds the correct match', () => {
      const step = createMoveStep(8, 5, 'point-to-point')
      const readyMoves = [
        createReadyMove('point-13', 13, 7, 'point', 6),
        createReadyMove('point-8', 8, 5, 'point', 3), // This should match
        createReadyMove('point-6', 6, 1, 'point', 5),
      ]

      const result = matchStepToReadyMove(step, readyMoves, 'clockwise', null)

      expect(result.matched).toBe(true)
      expect(result.originId).toBe('point-8')
    })
  })
})
