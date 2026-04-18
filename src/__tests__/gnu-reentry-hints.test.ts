/**
 * Integration: GNUBG hints should include a bar reentry when the active player
 * has checkers on the bar and the roll allows entry.
 *
 * This test validates our position export + hint request, not GNU itself.
 * It is skipped unless RUN_GNUBG_HINTS=1.
 */

import { describe, expect, it, jest } from '@jest/globals'
import type { BackgammonBoard } from '@nodots/backgammon-types'

const RUN = process.env.RUN_GNUBG_HINTS === '1'
const itfn = RUN ? it : it.skip

describe('GNUBG hints include bar reentry when entry is legal', () => {
  itfn('returns a reentry move for a bar position with roll [1,2]', async () => {
    jest.unmock('@nodots/gnubg-hints')
    const { GnuBgHints } = await import('@nodots/gnubg-hints')
    await GnuBgHints.initialize()
    const { exportToGnuPositionId } = await import(
      '../../../core/src/Board/gnuPositionId.js'
    )

    const points = Array.from({ length: 24 }, (_, idx) => ({
      id: `point-${idx + 1}`,
      kind: 'point' as const,
      position: { clockwise: idx + 1, counterclockwise: 24 - idx },
      checkers: [] as any[],
    }))

    const board: BackgammonBoard = {
      id: 'board-1',
      points: points as any,
      bar: {
        clockwise: {
          id: 'bar-cw',
          kind: 'bar' as const,
          direction: 'clockwise' as const,
          position: 'bar' as const,
          checkers: [{ id: 'b1', color: 'black' }],
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
      id: 'player-black',
      color: 'black',
      direction: 'clockwise',
      stateKind: 'moving',
      isRobot: true,
      dice: { stateKind: 'rolled', currentRoll: [1, 2] },
    }
    const inactivePlayer = {
      id: 'player-white',
      color: 'white',
      direction: 'counterclockwise',
      stateKind: 'inactive',
      isRobot: false,
      dice: { stateKind: 'inactive', currentRoll: [0, 0] },
    }

    const game = {
      id: 'game-reentry-hints',
      stateKind: 'moving',
      board,
      activeColor: 'black',
      activePlayer,
      activePlay: {
        id: 'play-1',
        stateKind: 'moving',
        player: activePlayer,
        moves: [],
      },
      players: [activePlayer, inactivePlayer],
    }

    const pid = exportToGnuPositionId(game as any)
    const hints = await GnuBgHints.getHintsFromPositionId(
      pid,
      [1, 2],
      3,
      activePlayer.direction,
      activePlayer.color
    )

    const hasReentry = hints.some((h) =>
      h.moves.some((m) => m.moveKind === 'reenter' || m.fromContainer === 'bar')
    )
    expect(hasReentry).toBe(true)
  })
})
