/**
 * Robot Turn Execution with GNU Backgammon
 *
 * This module contains GNU-specific logic for executing complete robot turns.
 * It was moved from @nodots-llc/backgammon-core to maintain separation of concerns
 * and keep GNU dependencies isolated to the AI package.
 */

import {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonGame,
  BackgammonMoveDestination,
  BackgammonMoveDirection,
  BackgammonMoveOrigin,
  BackgammonDieValue,
  BackgammonBoard,
  BackgammonPlayMoving,
  BackgammonPlayerMoving,
  BackgammonMoveCompletedWithMove,
  BackgammonMoveSkeleton,
} from '@nodots-llc/backgammon-types'
import type { MoveStep } from '@nodots-llc/gnubg-hints'
import { buildHintContextFromGame } from './hintContext.js'
import { gnubgHints } from './gnubg.js'
import { logger as coreLogger, generateId } from '@nodots-llc/backgammon-core'

// Lazy imports to break circular dependency (ESM-compatible)
let Core: any = null
const getCore = async () => {
  if (!Core) {
    Core = await import('@nodots-llc/backgammon-core')
  }
  return Core
}

// Use shared logger while keeping AI prefixing for clarity.
const withAiPrefix = (msg: string) =>
  msg.startsWith('[AI]') ? msg : `[AI] ${msg}`
const logger = {
  debug: (msg: string, ...args: any[]) =>
    coreLogger.debug(withAiPrefix(msg), ...args),
  info: (msg: string, ...args: any[]) =>
    coreLogger.info(withAiPrefix(msg), ...args),
  warn: (msg: string, ...args: any[]) =>
    coreLogger.warn(withAiPrefix(msg), ...args),
  error: (msg: string, ...args: any[]) =>
    coreLogger.error(withAiPrefix(msg), ...args),
}

const toMovesArray = (moves: any): any[] =>
  Array.isArray(moves) ? moves : moves ? Array.from(moves) : []

const summarizeReadyMoves = (game: BackgammonGameMoving): any[] => {
  const direction = (game.activePlayer as any)?.direction
  return toMovesArray((game as any).activePlay?.moves)
    .filter((m) => m.stateKind === 'ready')
    .slice(0, 10)
    .map((m) => {
      const pm = Array.isArray(m.possibleMoves) ? m.possibleMoves[0] : undefined
      return {
        dieValue: m.dieValue,
        moveKind: m.moveKind,
        originPos: pm?.origin?.position?.[direction] ?? null,
        destPos: pm?.destination?.position?.[direction] ?? null,
      }
    })
}

const formatStepSummary = (step: MoveStep) => ({
  from: step.from,
  to: step.to,
  kind: step.moveKind,
  player: step.player,
})

/**
 * Position-based move matcher result
 */
interface PositionMatchResult {
  matched: boolean
  originId: string | null
  matchedDestinationId?: string | null // CORE's destination when different from GNU's
  matchStrategy: 'id' | 'position' | 'none'
  expectedDie?: number
  matchedDie?: number
}

/**
 * Match a GNU hint step to a READY move using position-based matching
 *
 * This is the canonical matcher that compares:
 * - Origin position (from player's perspective)
 * - Destination position (from player's perspective)
 * - Move kind (point-to-point, reenter, bear-off)
 * - Die value (when applicable)
 *
 * ID matching is used as a fast path but position matching is the canonical gate.
 */
const matchStepToReadyMove = (
  step: MoveStep,
  readyMoves: any[],
  direction: BackgammonMoveDirection,
  mappedOriginId: string | null
): PositionMatchResult => {
  const plannedFrom = step.from
  const plannedTo = step.to
  const plannedKind = step.moveKind

  // Calculate expected die from the step
  let stepExpectedDie: number | undefined
  if (plannedKind === 'point-to-point' && typeof plannedFrom === 'number' && typeof plannedTo === 'number') {
    stepExpectedDie = Math.abs(plannedFrom - plannedTo)
  } else if (plannedKind === 'reenter' && typeof plannedTo === 'number') {
    // For reentry: GNU's to=24 means die=1, to=19 means die=6
    // The formula is: die = 25 - destination_position
    stepExpectedDie = 25 - plannedTo
  } else if (plannedKind === 'bear-off' && typeof plannedFrom === 'number') {
    stepExpectedDie = plannedFrom
  }

  // Fast path: try ID match first
  if (mappedOriginId) {
    for (const m of readyMoves) {
      if (!Array.isArray(m.possibleMoves)) continue
      // dieValue can be on the move object or on possibleMove
      const moveDie = (m as any)?.dieValue
      for (const pm of m.possibleMoves) {
        if (pm?.origin?.id === mappedOriginId) {
          // Also verify die value matches to ensure we use the correct die
          const pmDie = pm?.dieValue ?? moveDie
          if (stepExpectedDie !== undefined && typeof pmDie === 'number' && pmDie !== stepExpectedDie) {
            // ID matches but die value doesn't - try to find another possibleMove with correct die
            continue
          }
          return {
            matched: true,
            originId: mappedOriginId,
            matchStrategy: 'id',
            expectedDie: stepExpectedDie,
            matchedDie: pmDie,
          }
        }
      }
    }
  }

  // Canonical path: position-based matching
  for (const m of readyMoves) {
    if (!Array.isArray(m.possibleMoves)) continue
    // dieValue can be on the move object or on possibleMove
    const moveDie = (m as any)?.dieValue
    for (const pm of m.possibleMoves) {
      const org = pm?.origin
      const dst = pm?.destination
      if (!org || !dst) continue
      const pmDie = pm?.dieValue ?? moveDie

      // Reenter: origin must be bar, die value must match exactly
      // GNU is authoritative - if die doesn't match, it's a bug to fix
      if (plannedKind === 'reenter' && org.kind === 'bar') {
        // Die value must match exactly for reentry (same as point-to-point)
        if (typeof pmDie === 'number' && pmDie !== stepExpectedDie) {
          continue
        }
        return {
          matched: true,
          originId: org.id,
          matchStrategy: 'position',
          expectedDie: stepExpectedDie,
          matchedDie: pmDie,
        }
      }

      // Bear-off: destination must be off, origin position must match
      if (plannedKind === 'bear-off' && dst?.kind === 'off') {
        if (typeof plannedFrom === 'number') {
          const opos = org?.position?.[direction]
          if (typeof opos === 'number' && opos === plannedFrom) {
            // For bear-off, die value must be >= position (can use higher die when no higher checkers)
            if (typeof pmDie === 'number' && stepExpectedDie !== undefined && pmDie < stepExpectedDie) {
              continue
            }
            return {
              matched: true,
              originId: org.id,
              matchStrategy: 'position',
              expectedDie: stepExpectedDie,
              matchedDie: pmDie,
            }
          }
        }
      }

      // Point-to-point: both origin and destination positions must match
      if (plannedKind === 'point-to-point') {
        const opos = org?.position?.[direction]
        const dpos = dst?.position?.[direction]
        if (
          typeof plannedFrom === 'number' &&
          typeof plannedTo === 'number' &&
          typeof opos === 'number' &&
          typeof dpos === 'number' &&
          opos === plannedFrom &&
          dpos === plannedTo
        ) {
          // Die value must match exactly for point-to-point
          if (typeof pmDie === 'number' && pmDie !== stepExpectedDie) {
            continue
          }
          return {
            matched: true,
            originId: org.id,
            matchStrategy: 'position',
            expectedDie: stepExpectedDie,
            matchedDie: pmDie,
          }
        }
      }
    }
  }

  return {
    matched: false,
    originId: null,
    matchStrategy: 'none',
  }
}

/**
 * Find the best matching hint from a list of hints
 *
 * Iterates through hints (rank 1 to K) and returns the first one
 * where the first step can be matched to a READY move.
 */
const findMatchingHint = (
  hints: Array<{ moves: MoveStep[] }>,
  readyMoves: any[],
  direction: BackgammonMoveDirection,
  game: BackgammonGameMoving
): { hint: { moves: MoveStep[] } | null; hintRank: number; matchResult: PositionMatchResult | null } => {
  for (let rank = 0; rank < hints.length; rank++) {
    const hint = hints[rank]
    if (!hint?.moves || hint.moves.length === 0) continue

    const firstStep = hint.moves[0]
    let mappedOriginId: string | null = null

    try {
      const { origin } = getCheckercontainersForGnuStep(firstStep, game)
      mappedOriginId = origin?.id ?? null
    } catch {
      mappedOriginId = null
    }

    const matchResult = matchStepToReadyMove(firstStep, readyMoves, direction, mappedOriginId)
    if (matchResult.matched) {
      return { hint, hintRank: rank + 1, matchResult }
    }
  }
  return { hint: null, hintRank: 0, matchResult: null }
}

/**
 * Convert GNU Backgammon move step to Nodots checker containers
 *
 * Maps GNU's position notation to Nodots' checker container system,
 * handling point-to-point moves, bear-offs, and bar re-entries.
 */
const getCheckercontainersForGnuStep = (
  move: MoveStep,
  game: BackgammonGameMoving
): {
  origin: BackgammonMoveOrigin
  destination: BackgammonMoveDestination
  direction: BackgammonMoveDirection
  expectedDieValue?: BackgammonDieValue
} => {
  const { activePlayer, board } = game
  const gnuTo = move.to
  const gnuFrom = move.from
  const gnuMoveKind = move.moveKind
  const gnuColor = move.player
  let origin: BackgammonMoveOrigin | undefined = undefined
  let destination: BackgammonMoveDestination | undefined = undefined
  // Always use the active player's actual direction from the game state
  const direction: BackgammonMoveDirection = game.activePlayer.direction
  switch (gnuMoveKind) {
    case 'point-to-point':
      {
        origin = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuFrom
        )
        destination = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuTo
        )
        if (!origin || !destination)
          throw new Error(
            `Missing Nodots origin ${JSON.stringify(origin)} or destination ${JSON.stringify(destination)}`
          )
      }
      break
    case 'bear-off':
      {
        {
          origin = board.points.find(
            (p) => p.position[activePlayer.direction] === gnuFrom
          )
          if (!origin)
            throw new Error(`Invalid origin for ${JSON.stringify(move)}`)
          destination = board.off[activePlayer.direction]
        }
      }
      break

    case 'reenter':
      {
        origin = board.bar[activePlayer.direction]
        destination = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuTo
        )
        if (!destination)
          throw new Error(`Invalid destination for ${JSON.stringify(move)}`)
      }
      break
    default:
      throw new Error(`Invalid move kind ${gnuMoveKind}`)
  }
  logger.debug(
    'getCheckercontainersForGnuStep origin, destination:',
    origin,
    destination
  )
  const expectedDieValue = (() => {
    if (gnuMoveKind === 'point-to-point' && typeof gnuFrom === 'number' && typeof gnuTo === 'number') {
      return Math.abs(gnuFrom - gnuTo) as BackgammonDieValue
    }
    if (gnuMoveKind === 'reenter' && typeof gnuTo === 'number') {
      return (25 - gnuTo) as BackgammonDieValue
    }
    if (gnuMoveKind === 'bear-off' && typeof gnuFrom === 'number') {
      return gnuFrom as BackgammonDieValue
    }
    return undefined
  })()
  return { origin, destination, direction, expectedDieValue }
}

/**
 * Detect if a move will result in a hit (blot on destination)
 */
const detectHit = (
  destination: BackgammonMoveDestination,
  activePlayer: BackgammonPlayerMoving
): boolean => {
  // Off and bar are never hits
  if ((destination as any).kind === 'off' || (destination as any).kind === 'bar') {
    return false
  }
  const checkers = (destination as any).checkers || []
  // Hit = exactly one opponent checker
  return checkers.length === 1 && checkers[0]?.color !== activePlayer.color
}

/**
 * Calculate die value from a GNU step
 */
const calculateDieValue = (step: MoveStep): BackgammonDieValue => {
  if (step.moveKind === 'point-to-point' && typeof step.from === 'number' && typeof step.to === 'number') {
    return Math.abs(step.from - step.to) as BackgammonDieValue
  }
  if (step.moveKind === 'reenter' && typeof step.to === 'number') {
    // For reentry: destination position = 25 - die, so die = 25 - destination
    return (25 - step.to) as BackgammonDieValue
  }
  if (step.moveKind === 'bear-off' && typeof step.from === 'number') {
    return step.from as BackgammonDieValue
  }
  throw new Error(`Cannot calculate die value for step: ${JSON.stringify(step)}`)
}

/**
 * Determine move kind from origin container
 */
const determineMoveKind = (
  origin: BackgammonMoveOrigin,
  destination: BackgammonMoveDestination
): 'point-to-point' | 'bear-off' | 'reenter' => {
  if ((origin as any).kind === 'bar') return 'reenter'
  if ((destination as any).kind === 'off') return 'bear-off'
  return 'point-to-point'
}

/**
 * Find an available die that can make a bear-off move from the given position.
 * For bear-off: exact die match, OR higher die if no checkers on higher points.
 */
const findAvailableDieForBearOff = (
  game: BackgammonGameMoving,
  fromPosition: number
): BackgammonDieValue | undefined => {
  const activePlay = (game as any).activePlay
  const moves = toMovesArray(activePlay?.moves || [])
  const direction = game.activePlayer.direction

  // Get available (ready) dice
  const availableDice = moves
    .filter((m: any) => m.stateKind === 'ready')
    .map((m: any) => m.dieValue as BackgammonDieValue)

  // First try exact match
  if (availableDice.includes(fromPosition as BackgammonDieValue)) {
    return fromPosition as BackgammonDieValue
  }

  // For higher dice, check if no checkers exist on higher points
  const playerPoints = game.board.points.filter(
    (p: any) => p.checkers?.length > 0 && p.checkers[0]?.color === game.activePlayer.color
  )
  const highestCheckerPosition = Math.max(
    ...playerPoints.map((p: any) => p.position[direction] as number)
  )

  // If this is the highest checker, any die >= position can bear it off
  if (fromPosition >= highestCheckerPosition) {
    const validDice = availableDice.filter((d) => d >= fromPosition)
    if (validDice.length > 0) {
      return validDice[0]
    }
  }

  return undefined
}

const canAssignBearOffDice = (froms: number[], dice: number[]): boolean => {
  if (froms.length === 0) return true
  const sortedFroms = [...froms].sort((a, b) => b - a)
  const sortedDice = [...dice].sort((a, b) => b - a)
  for (const from of sortedFroms) {
    const idx = sortedDice.findIndex((d) => d >= from)
    if (idx === -1) return false
    sortedDice.splice(idx, 1)
  }
  return true
}

const pickBearOffDie = (
  fromPosition: number,
  availableDice: BackgammonDieValue[],
  remainingBearOffFroms: number[]
): BackgammonDieValue => {
  const candidates = availableDice
    .filter((d) => d >= fromPosition)
    .sort((a, b) => a - b)
  for (const candidate of candidates) {
    const remainingDice = [...availableDice]
    const idx = remainingDice.indexOf(candidate)
    if (idx !== -1) {
      remainingDice.splice(idx, 1)
    }
    if (canAssignBearOffDice(remainingBearOffFroms, remainingDice)) {
      return candidate
    }
  }
  throw new Error(
    `No available die for bear-off from position ${fromPosition} (dice=${JSON.stringify(
      availableDice
    )})`
  )
}

/**
 * Execute a GNU hint step directly using CORE's executeAndRecalculate.
 * GNU is authoritative - we trust its move suggestions and derive origin/destination
 * from GNU coordinates, then let CORE handle proper state transitions.
 *
 * @param game - Current game in moving state
 * @param step - GNU hint step to execute
 * @returns Updated game state after move execution
 */
const executeGnuStepDirectly = async (
  game: BackgammonGameMoving,
  step: MoveStep,
  dieValueOverride?: BackgammonDieValue
): Promise<BackgammonGameMoving> => {
  const CoreUtil = await getCore()
  const { activePlayer } = game
  const direction = activePlayer.direction
  const trace = process.env.NDBG_AI_TRACE === '1'

  // 1. Resolve origin and destination from GNU coordinates
  const { origin, destination } = getCheckercontainersForGnuStep(step, game)

  // 2. Basic validation (optional - GNU is GOD)
  const originCheckers = (origin as any).checkers || []
  if (originCheckers.length === 0) {
    throw new Error(`Direct execution: origin has no checkers (step=${JSON.stringify(formatStepSummary(step))})`)
  }
  if (originCheckers[0]?.color !== activePlayer.color) {
    throw new Error(`Direct execution: origin checker color mismatch (step=${JSON.stringify(formatStepSummary(step))})`)
  }

  // 3. Calculate die value - special handling for bear-off
  let dieValue: BackgammonDieValue
  if (step.moveKind === 'bear-off' && typeof step.from === 'number') {
    // For bear-off, prefer the caller-provided die assignment
    if (dieValueOverride) {
      dieValue = dieValueOverride
    } else {
      const availableDie = findAvailableDieForBearOff(game, step.from)
      if (!availableDie) {
        throw new Error(`No available die for bear-off from position ${step.from}`)
      }
      dieValue = availableDie
    }
  } else {
    dieValue = calculateDieValue(step)
  }

  if (trace) {
    logger.info('[AI][TRACE] Direct execution step', {
      step: formatStepSummary(step),
      dieValue,
      originId: origin.id,
      destinationId: destination.id,
      direction,
    })
  }

  // 4. Use CORE's executeAndRecalculate with GNU-derived origin/destination
  // This ensures proper state transitions (turn changes, game completion, etc.)
  const updatedGame = CoreUtil.Game.executeAndRecalculate(game, origin.id, {
    desiredDestinationId: destination.id,
    expectedDieValue: dieValue,
  })

  return updatedGame as BackgammonGameMoving
}

/**
 * Execute a complete robot turn using GNU Backgammon hints
 *
 * This function:
 * 1. Initializes GNU Backgammon engine
 * 2. Requests hints for the current position
 * 3. Executes the top-ranked move sequence
 * 4. Transitions game state to rolling for next player
 *
 * @param game - Game in moving state with robot as active player
 * @returns Game in rolling state ready for next player
 * @throws Error if gnuPositionId is missing
 * @throws Error if GNU Backgammon returns no hints
 * @throws Error if move execution fails
 */
export const executeRobotTurnWithGNU = async (
  game: BackgammonGameMoving
): Promise<BackgammonGameRolling> => {
  const CoreUtil = await getCore()
  const trace = process.env.NDBG_AI_TRACE === '1'

  const roll = (game.activePlayer as any)?.dice?.currentRoll as
    | [BackgammonDieValue, BackgammonDieValue]
    | undefined
  if (!Array.isArray(roll) || roll.length !== 2) {
    throw new Error('Robot turn requires an active player roll')
  }

  const ctx = buildHintContextFromGame(game as any, { dice: roll })
  const hintDirection = ctx.request.activePlayerDirection
  const hintColor = ctx.request.activePlayerColor
  const computedNeedsMirror = hintDirection !== 'clockwise'

  if (trace) {
    // DIAGNOSTIC: Dump board state being sent to GNU
    const boardPoints = game.board.points
      .filter((p: any) => p.checkers?.length > 0)
      .map((p: any) => ({
        cwPos: p.position?.clockwise,
        ccwPos: p.position?.counterclockwise,
        checkers: p.checkers?.length,
        color: p.checkers?.[0]?.color,
      }))

    logger.info('[AI][TRACE] requesting GNU hints', {
      gameId: (game as any)?.id,
      roll,
      activeColor: hintColor,
      direction: hintDirection,
      needsMirror: computedNeedsMirror,
      boardSnapshot: boardPoints,
    })
  }
  let hints = await gnubgHints.getMoveHints(ctx.request as any, 5)

  // DIAGNOSTIC: Log the converted hint positions
  if (trace && hints && hints.length > 0) {
    const firstHint = hints[0]
    logger.info('[AI][TRACE] GNU hints received (post-conversion)', {
      hintCount: hints.length,
      rank1Steps: firstHint?.moves?.map((m: MoveStep) => ({
        from: m.from,
        to: m.to,
        kind: m.moveKind,
        player: m.player,
      })),
      normalizationUsed: {
        activePlayerDirection: hintDirection,
        activePlayerColor: hintColor,
        needsMirror: computedNeedsMirror,
      },
    })
  }

  if (!hints || hints.length === 0) {
    // Output ASCII board for debugging
    const CoreMod = await getCore()
    const asciiBoard = CoreMod?.ascii
      ? CoreMod.ascii(game.board, game.players, game.activePlayer)
      : '[ASCII board unavailable]'
    console.log('\n=== NO HINTS ASCII BOARD ===')
    console.log(asciiBoard)
    console.log(`Roll: [${roll}]`)
    console.log('GNU returned 0 hints for this position')
    console.log('============================\n')
    throw new Error('GNU Backgammon returned no hints for the current position')
  }

  const plan = hints[0]?.moves || []
  if (trace) {
    logger.info('[AI][TRACE] hint plan selected', {
      hintRank: 1,
      planLength: plan.length,
      plan: plan.map(formatStepSummary),
    })
  }
  if (!plan.length) {
    throw new Error('GNU Backgammon returned an empty move sequence')
  }

  // Direct execution: execute GNU steps directly without matching to pre-computed moves
  // GNU is authoritative - we trust its move suggestions
  let workingGame: BackgammonGameMoving = game
  let availableDice = toMovesArray((workingGame as any).activePlay?.moves)
    .filter((m) => m.stateKind === 'ready')
    .map((m) => m.dieValue as BackgammonDieValue)

  // Telemetry collection for PR calculation
  // GNU uses numeric positions: 1-24 for points, 0 for bar/off
  const telemetry: Array<{
    plannedFrom: number
    plannedTo: number
    plannedKind: string
    matchedDie: number
  }> = []

  for (let stepIndex = 0; stepIndex < plan.length; stepIndex++) {
    const step = plan[stepIndex]
    const remainingBearOffFroms = plan
      .slice(stepIndex + 1)
      .filter((s) => s.moveKind === 'bear-off' && typeof s.from === 'number')
      .map((s) => s.from as number)

    let dieValue: BackgammonDieValue
    if (step.moveKind === 'bear-off' && typeof step.from === 'number') {
      dieValue = pickBearOffDie(
        step.from,
        availableDice,
        remainingBearOffFroms
      )
    } else {
      dieValue = calculateDieValue(step)
      if (!availableDice.includes(dieValue)) {
        throw new Error(
          `GNU step requires die ${dieValue} but it is not available (dice=${JSON.stringify(
            availableDice
          )})`
        )
      }
    }

    if (trace) {
      logger.info(`[AI][TRACE] Executing step ${stepIndex + 1}/${plan.length}`, {
        step: formatStepSummary(step),
        direction: workingGame.activePlayer?.direction,
        dieValue,
      })
    }

    try {
      workingGame = await executeGnuStepDirectly(workingGame, step, dieValue)
      const usedIndex = availableDice.indexOf(dieValue)
      if (usedIndex !== -1) {
        availableDice.splice(usedIndex, 1)
      }

      // Record telemetry for PR calculation
      // GNU uses numeric positions: 1-24 for points, 0 for bar/off
      telemetry.push({
        plannedFrom: step.from,
        plannedTo: step.to,
        plannedKind: step.moveKind,
        matchedDie: dieValue,
      })
    } catch (error) {
      // Output diagnostic information on failure
      const CoreMod = await getCore()
      const gnuPositionId =
        typeof CoreMod?.exportToGnuPositionId === 'function'
          ? CoreMod.exportToGnuPositionId(workingGame as any)
          : 'unknown'
      const asciiBoard = CoreMod?.ascii
        ? CoreMod.ascii(workingGame.board, workingGame.players, workingGame.activePlayer)
        : '[ASCII board unavailable]'
      console.log('\n=== DIRECT EXECUTION FAILURE ===')
      console.log(asciiBoard)
      console.log(`Roll: [${roll}]`)
      console.log(`Step ${stepIndex + 1}/${plan.length}: ${step.moveKind} from ${step.from} to ${step.to}`)
      console.log(`Error: ${String(error)}`)
      console.log('================================\n')

      throw new Error(
        `GNU direct execution failed (gnu_position_id=${gnuPositionId}, roll=${roll}, step=${JSON.stringify(
          formatStepSummary(step)
        )}): ${String(error)}`
      )
    }

    // Check if game completed (all checkers borne off)
    if ((workingGame as any).stateKind === 'completed') {
      break
    }

    // Check if all moves are completed for this turn
    const remainingReady = toMovesArray((workingGame as any).activePlay?.moves).filter(
      (m) => m.stateKind === 'ready'
    )
    if (remainingReady.length === 0) {
      break
    }
  }

  // Final guard: no READY moves should remain; if they do, throw to surface the failure
  workingGame = finalizeNoMoveTurn(workingGame as any, CoreUtil) as any

  try {
    assertNoReadyMoves(workingGame)
  } catch (error) {
    const gnuPositionId =
      typeof CoreUtil?.Board?.exportToGnuPositionId === 'function'
        ? CoreUtil.Board.exportToGnuPositionId(workingGame as any)
        : 'unknown'
    throw new Error(
      `GNU turn left READY moves (gnu_position_id=${gnuPositionId}, roll=${roll}): ${String(
        error
      )}`
    )
  }

  // After all moves completed, game transitions to 'rolling' state for next player
  // Attach telemetry for PR calculation before returning
  // Type assertion: __aiTelemetry is a diagnostic property not part of the formal type
  ;(workingGame as any).__aiTelemetry = telemetry

  // Type assertion through unknown required because stateKind changes from 'moving' to 'rolling'
  return workingGame as unknown as BackgammonGameRolling
}

// Export matching functions for testing
export { matchStepToReadyMove, findMatchingHint, PositionMatchResult }

/**
 * Guard: ensure no READY moves remain after robot execution.
 * Throws if any READY moves are present (indicating the robot left playable dice).
 */
export function assertNoReadyMoves(game: any): void {
  const moves = toMovesArray(game?.activePlay?.moves)
  const ready = moves.filter((m) => m.stateKind === 'ready')
  if (ready.length > 0) {
    const dice = (game.activePlayer as any)?.dice?.currentRoll
    const samples = ready.slice(0, 5).map((m) => {
      const pm = Array.isArray(m.possibleMoves) ? m.possibleMoves[0] : undefined
      return {
        die: m.dieValue,
        moveKind: m.moveKind,
        originPos:
          pm?.origin?.position?.[(game.activePlayer as any)?.direction] ?? null,
        destPos:
          pm?.destination?.position?.[
            (game.activePlayer as any)?.direction
          ] ?? null,
      }
    })
    throw new Error(
      `Robot turn finished with READY moves remaining (dice=${dice}): ${JSON.stringify(
        samples
      )}`
    )
  }
}

/**
 * If remaining dice have no legal moves, convert them to completed no-move
 * and advance the turn for robot execution.
 */
function finalizeNoMoveTurn(
  game: BackgammonGame,
  CoreUtil: any
): BackgammonGame {
  if (game.stateKind !== 'moving') {
    return game
  }

  const activePlay = (game as any).activePlay
  if (!activePlay?.moves) {
    return game
  }

  const moves = toMovesArray(activePlay.moves)
  const readyMoves = moves.filter((m) => m.stateKind === 'ready')
  if (readyMoves.length === 0) {
    return game
  }

  const hasLegalMove = readyMoves.some((move) => {
    const possible = CoreUtil.Board.getPossibleMoves(
      game.board,
      game.activePlayer,
      move.dieValue as BackgammonDieValue
    ) as BackgammonMoveSkeleton[]
    return Array.isArray(possible) && possible.length > 0
  })

  if (hasLegalMove) {
    return game
  }

  const updatedMoves = moves.map((move) => {
    if (move.stateKind !== 'ready') {
      return move
    }
    return {
      ...move,
      stateKind: 'completed',
      moveKind: 'no-move',
      possibleMoves: [],
      origin: undefined,
      destination: undefined,
      isHit: false,
    }
  })

  const updatedGame = {
    ...game,
    activePlay: {
      ...activePlay,
      moves: updatedMoves,
    },
  }

  const checked = CoreUtil.Game.checkAndCompleteTurn(updatedGame as any)
  if (checked.stateKind === 'moved' && checked.activePlayer?.isRobot) {
    return CoreUtil.Game.confirmTurn(checked as any)
  }

  return checked
}
