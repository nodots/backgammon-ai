/**
 * Regression: For position 3wtBIGCV96QCAA with dice [5,2], GNU should
 * recommend re-entry from bar using the lower die (2), and the remaining die
 * should end as no-move/completed. The root cause was that our PID’s first
 * half did not always correspond to the side-to-move when asking for hints.
 *
 * This test exercises just the hint layer by rotating the PID halves so the
 * active side is first for GNU, then asserting that a reentry move is present.
 *
 * NOTE: This test requires gnubg-hints native addon and gnubg engine
 * installed. It is skipped by default unless RUN_GNUBG_HINTS=1
 */

import { GnuBgHints } from '@nodots/gnubg-hints'

function swapPidHalves(pid: string): string {
  const buf = Buffer.from(pid + '==', 'base64')
  if (buf.length !== 10) return pid
  const swapped = Buffer.concat([buf.subarray(5), buf.subarray(0, 5)])
  return swapped.toString('base64').replace(/=+$/, '').substring(0, 14)
}

describe('Regression: bar re-entry on [5,2] roll with correct PID half ordering', () => {
  const RUN = process.env.RUN_GNUBG_HINTS === '1'
  const PID = '3wtBIGCV96QCAA' // from stuck game
  const DICE: [number, number] = [5, 2]

  const itfn = RUN ? it : it.skip

  itfn('gnubg-hints returns a re-entry from bar when halves are rotated', async () => {
    await GnuBgHints.initialize()
    const rotated = swapPidHalves(PID)
    const hints = await GnuBgHints.getHintsFromPositionId(rotated, DICE, 3)
    expect(hints.length).toBeGreaterThan(0)
    const hasReentry = hints.some((h) =>
      h.moves.some((m) => m.moveKind === 'reenter' || m.fromContainer === 'bar')
    )
    expect(hasReentry).toBeTruthy()
  })
})
