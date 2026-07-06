/**
 * Strict validation of a vendor-returned play against the position's legal
 * moves.
 *
 * A black-box HTTP engine returns a chosen play as MoveStep[]. Before that play
 * is trusted it must be proven legal for the position. This module delegates the
 * match to CORE's MoveComparator.findMatchingHint (ordered / unordered / subset
 * matching) rather than re-implementing move equivalence.
 *
 * No-silent-fallback rule: an unmatched vendor play THROWS with full diagnostics
 * (positionId, dice, returned move, legal moves). It never resolves to a
 * substitute move.
 */

import type { MoveHint, MoveStep } from './contract.js'

/** from/to pair CORE's comparator matches against. */
interface SimplifiedMove {
  from: number
  to: number
}

/** Diagnostic context carried into the thrown error. */
export interface MoveValidationContext {
  positionId: string
  dice: [number, number]
  engineId: string
}

/** Error thrown when a vendor play cannot be matched to a legal play. */
export class IllegalVendorMoveError extends Error {
  readonly positionId: string
  readonly dice: [number, number]
  readonly engineId: string
  readonly returnedMove: MoveStep[]
  readonly legalMoves: MoveHint[]

  constructor(
    context: MoveValidationContext,
    returnedMove: MoveStep[],
    legalMoves: MoveHint[]
  ) {
    const returnedStr = stepsToString(returnedMove)
    const legalStr =
      legalMoves.length === 0
        ? '(none)'
        : legalMoves.map((h) => stepsToString(h.moves)).join(' | ')
    super(
      `[AI] HttpEngineProvider: vendor engine "${context.engineId}" returned an ` +
        `ILLEGAL move for position ${context.positionId} with dice ` +
        `[${context.dice.join(',')}]. Returned=${returnedStr}. ` +
        `Legal moves=${legalStr}. Refusing to fall back.`
    )
    this.name = 'IllegalVendorMoveError'
    this.positionId = context.positionId
    this.dice = context.dice
    this.engineId = context.engineId
    this.returnedMove = returnedMove
    this.legalMoves = legalMoves
  }
}

const stepsToString = (steps: MoveStep[]): string =>
  steps.length === 0
    ? '(empty)'
    : steps.map((s) => `${s.from}/${s.to}`).join(' ')

const toSimplified = (steps: MoveStep[]): SimplifiedMove[] =>
  steps.map((s) => ({ from: s.from, to: s.to }))

/**
 * Assert a vendor play is legal for the position. Returns the matching legal
 * MoveHint on success; throws IllegalVendorMoveError otherwise.
 *
 * legalMoves is the enumerated set of legal plays for the position (each a
 * MoveHint). It is supplied by the caller -- this function does not consult any
 * engine itself, so it stays free of the native GNU addon.
 */
export async function assertVendorMoveLegal(
  returnedMove: MoveStep[],
  legalMoves: MoveHint[],
  context: MoveValidationContext
): Promise<MoveHint> {
  // Subpath import: findMatchingHint is not re-exported from the core index,
  // and this module (MoveComparator) is pure -- it does not pull in the native
  // gnubg addon. Lazy dynamic import mirrors robotExecution's core-import
  // pattern for ESM/CJS interop.
  const { findMatchingHint } = await import(
    '@nodots/backgammon-core/dist/Services/MoveComparator.js'
  )

  const match = findMatchingHint(legalMoves, toSimplified(returnedMove))
  if (!match) {
    throw new IllegalVendorMoveError(context, returnedMove, legalMoves)
  }
  return match
}
