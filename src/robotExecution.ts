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
  BackgammonMoveDestination,
  BackgammonMoveDirection,
  BackgammonMoveOrigin,
  BackgammonRoll,
  BackgammonDieValue,
} from '@nodots-llc/backgammon-types'
import type { OverrideInfo, OverrideReason, AITelemetryStep } from '@nodots-llc/backgammon-types'
import { GnuBgHints, MoveStep } from '@nodots-llc/gnubg-hints'
import fs from 'fs'
import path from 'path'

// Lazy imports to break circular dependency (ESM-compatible)
let Core: any = null
let Board: any = null
const getCore = async () => {
  if (!Core) {
    Core = await import('@nodots-llc/backgammon-core')
  }
  return Core
}
const getBoard = async () => {
  if (!Board) {
    const core = await getCore()
    Board = core.Board
  }
  return Board
}

// Simple logger to avoid circular dependency issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.log(`[AI] [DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.log(`[AI] [INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[AI] [WARN] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[AI] [ERROR] ${msg}`, ...args),
}

/**
 * Position-based move matcher result
 */
interface PositionMatchResult {
  matched: boolean
  originId: string | null
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

      // Reenter: origin must be bar, destination position must match
      if (plannedKind === 'reenter' && org.kind === 'bar') {
        if (typeof plannedTo === 'number') {
          const dpos = dst?.position?.[direction]
          if (typeof dpos === 'number' && dpos === plannedTo) {
            // Die value check: for reentry, die = 25 - destination (e.g., to=24 means die=1)
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
        } else {
          // No specific destination required, just match bar origin
          return {
            matched: true,
            originId: org.id,
            matchStrategy: 'position',
            expectedDie: stepExpectedDie,
            matchedDie: pmDie,
          }
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
  return { origin, destination, direction }
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
  await GnuBgHints.initialize()
  const CoreUtil = await getCore()

  let workingGame: any = game
  let aiFallbackUsed = false
  const fallbackReasons: string[] = []
  const telemetry: AITelemetryStep[] = []
  let guard = 8 // prevent infinite loops per turn

  // One-shot plan: ask GNU once for the full sequence and execute without re-asking mid-turn
  const startMoves = (workingGame.activePlay?.moves || []) as any[]
  const startReady = startMoves.filter((m) => m.stateKind === 'ready')
  const playerRoll = (workingGame.activePlayer as any)?.dice?.currentRoll as
    | BackgammonRoll
    | undefined
  let roll: BackgammonRoll
  let rollSource: 'player-currentRoll' | 'ready-derived' = 'ready-derived'
  if (Array.isArray(playerRoll) && playerRoll.length === 2) {
    const d1 = (playerRoll[0] ?? 1) as BackgammonDieValue
    const d2 = (playerRoll[1] ?? 1) as BackgammonDieValue
    roll = [d1, d2]
    rollSource = 'player-currentRoll'
  } else {
    const d1 = (startReady[0]?.dieValue ?? 1) as BackgammonDieValue
    const d2 = (
      startReady[1]?.dieValue ??
      (startReady.length > 1 ? startReady[1]?.dieValue ?? d1 : d1)
    ) as BackgammonDieValue
    roll = [d1, d2]
    rollSource = 'ready-derived'
  }

  // DIAGNOSTIC: Log game state before accessing gnuPositionId
  console.log('[AI:DIAGNOSTIC] Game state at position ID generation:', {
    gameId: workingGame.id,
    stateKind: workingGame.stateKind,
    activeColor: workingGame.activeColor,
    activePlayerColor: (workingGame.activePlayer as any)?.color,
    activePlayerDirection: (workingGame.activePlayer as any)?.direction,
    activePlayerIsRobot: (workingGame.activePlayer as any)?.isRobot,
    inactivePlayerColor: (workingGame.inactivePlayer as any)?.color,
    inactivePlayerDirection: (workingGame.inactivePlayer as any)?.direction,
    inactivePlayerIsRobot: (workingGame.inactivePlayer as any)?.isRobot,
  })

  const planPositionId = workingGame.gnuPositionId

  // DIAGNOSTIC: Log position ID
  console.log('[AI:DIAGNOSTIC] Position ID generated:', {
    positionId: planPositionId,
    roll,
    rollSource,
  })

  const playerDirection = (workingGame.activePlayer as any)?.direction || 'clockwise'
  let plan: MoveStep[] = []
  let hintRankUsed = 0
  let allHintsCount = 0
  try {
    // Request 5 hints to allow fallthrough if top hint doesn't match READY moves
    const hints = await GnuBgHints.getHintsFromPositionId(planPositionId, roll, 5)
    allHintsCount = hints?.length || 0
    // Find the first hint whose first step matches a READY move
    const { hint, hintRank } = findMatchingHint(
      hints || [],
      startReady,
      playerDirection,
      workingGame
    )
    if (hint) {
      plan = hint.moves || []
      hintRankUsed = hintRank
    }
  } catch {
    plan = []
  }
  let planIdx = 0
  const planLength = plan.length

  while (guard-- > 0 && workingGame.stateKind === 'moving') {
    const moves = (workingGame.activePlay?.moves || []) as any[]
    const ready = moves.filter((m) => m.stateKind === 'ready')

    // If no READY moves remain, let core decide turn completion
    if (ready.length === 0) {
      workingGame = CoreUtil.Game.checkAndCompleteTurn(workingGame)
      break
    }

    // Next planned step (if any)
    const positionId = workingGame.gnuPositionId
    let mappedOriginId: string | null = null
    let plannedFrom: number | null = null
    let plannedTo: number | null = null
    let plannedKind: string | undefined
    let expectedDie: number | undefined
    let matchedDie: number | undefined
    const stepFromPlan = planIdx < planLength ? plan[planIdx] : undefined
    if (stepFromPlan) {
      plannedFrom = (stepFromPlan as any).from ?? null
      plannedTo = (stepFromPlan as any).to ?? null
      plannedKind = (stepFromPlan as any).moveKind
      try {
        const { origin } = getCheckercontainersForGnuStep(stepFromPlan, workingGame)
        mappedOriginId = origin?.id ?? null
      } catch {
        mappedOriginId = null
      }
    }

    // Collect legal origin IDs for telemetry
    const legalOriginIds: string[] = []
    for (const m of ready) {
      if (!Array.isArray(m.possibleMoves)) continue
      for (const pm of m.possibleMoves) {
        const id = pm?.origin?.id
        if (id && !legalOriginIds.includes(id)) legalOriginIds.push(id)
      }
    }

    let originIdToUse: string | null = null
    let usedFallback = false
    let fallbackReason: string | undefined
    let matchStrategy: 'id' | 'position' | 'none' = 'none'

    // Use the position-based matcher when we have a planned step
    if (stepFromPlan) {
      const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
      const matchResult = matchStepToReadyMove(stepFromPlan, ready, dir, mappedOriginId)

      // Debug: log READY move positions for mismatch diagnosis
      const readyPositions = ready.map((m: any) => {
        if (!Array.isArray(m.possibleMoves) || m.possibleMoves.length === 0) return null
        const pm = m.possibleMoves[0]
        return {
          die: m.dieValue,
          originPos: pm?.origin?.position?.[dir],
          destPos: pm?.destination?.position?.[dir],
          originId: pm?.origin?.id,
        }
      }).filter(Boolean)
      logger.debug('[AI] Step matching', {
        planIdx,
        planned: { from: plannedFrom, to: plannedTo, kind: plannedKind },
        mappedOriginId,
        readyPositions,
        matchResult: { matched: matchResult.matched, strategy: matchResult.matchStrategy },
      })

      if (matchResult.matched && matchResult.originId) {
        originIdToUse = matchResult.originId
        matchStrategy = matchResult.matchStrategy
        expectedDie = matchResult.expectedDie
        matchedDie = matchResult.matchedDie
        // Update mappedOriginId for telemetry if position-based match found a different ID
        if (matchResult.matchStrategy === 'position') {
          mappedOriginId = matchResult.originId
        }
      } else {
        // Fallback: planned step could not be matched by id or position+die
        aiFallbackUsed = true
        usedFallback = true
        fallbackReason = 'core-move-mismatch'
        fallbackReasons.push(fallbackReason)
        try {
          const diag = {
            ts: new Date().toISOString(),
            gameId: (workingGame as any)?.id,
            positionId,
            roll,
            hintRankUsed,
            allHintsCount,
            dir,
            planned: { from: plannedFrom, to: plannedTo, kind: plannedKind },
            readyMovesSample: (ready as any[]).slice(0, 5).map((m: any) => {
              const pm = Array.isArray(m.possibleMoves) && m.possibleMoves[0]
              const oPos = pm?.origin?.position?.[dir]
              const dPos = pm?.destination?.position?.[dir]
              return { die: m?.dieValue, originPos: typeof oPos === 'number' ? oPos : null, destPos: typeof dPos === 'number' ? dPos : null, kind: m?.moveKind || pm?.moveKind }
            }),
          }
          const outDir = path.join(process.cwd(), 'scripts', 'diagnostics')
          const outFile = path.join(outDir, 'core-mismatch.log')
          try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
          fs.appendFile(outFile, JSON.stringify(diag) + '\n', () => {})
        } catch {}
        // Fallback heuristic: prioritize bear-off > hits > other moves
        const prioritize = (m: any) => {
          if (!Array.isArray(m.possibleMoves) || m.possibleMoves.length === 0)
            return 3
          const mk = m.moveKind || m.possibleMoves[0]?.moveKind
          if (mk === 'bear-off') return 0
          if (m.possibleMoves[0]?.isHit) return 1
          return 2
        }
        ready.sort((a, b) => prioritize(a) - prioritize(b))
        originIdToUse = ready[0]?.possibleMoves?.[0]?.origin?.id ?? null
      }
    } else {
      // No planned step available (GNU returned no matching hints)
      aiFallbackUsed = true
      usedFallback = true
      fallbackReason = 'no-gnu-hints-or-mapping-failed'
      fallbackReasons.push(fallbackReason)
      // Fallback heuristic: prioritize bear-off > hits > other moves
      const prioritize = (m: any) => {
        if (!Array.isArray(m.possibleMoves) || m.possibleMoves.length === 0)
          return 3
        const mk = m.moveKind || m.possibleMoves[0]?.moveKind
        if (mk === 'bear-off') return 0
        if (m.possibleMoves[0]?.isHit) return 1
        return 2
      }
      ready.sort((a, b) => prioritize(a) - prioritize(b))
      originIdToUse = ready[0]?.possibleMoves?.[0]?.origin?.id ?? null
    }

    if (!originIdToUse) {
      // Nothing executable — ask core to complete the turn if possible
      workingGame = CoreUtil.Game.checkAndCompleteTurn(workingGame)
      // Build CORE legality snapshot
      const dirSnap = (workingGame.activePlayer as any)?.direction || 'clockwise'
      const barCnt = ((workingGame.board as any)?.bar?.[dirSnap]?.checkers || []).length
      const offCnt = ((workingGame.board as any)?.off?.[dirSnap]?.checkers || []).length
      const sample: any[] = []
      for (const m of ready as any[]) {
        if (!Array.isArray(m.possibleMoves) || m.possibleMoves.length === 0) continue
        const pm = m.possibleMoves[0]
        const o = pm?.origin
        const d = pm?.destination
        const oPos = o?.position ? (o.position as any)[dirSnap] : null
        const dPos = d?.position ? (d.position as any)[dirSnap] : null
        sample.push({ die: (m as any)?.dieValue, originPos: typeof oPos === 'number' ? oPos : null, destPos: typeof dPos === 'number' ? dPos : null, kind: (m as any)?.moveKind || (pm as any)?.moveKind })
        if (sample.length >= 5) break
      }
      telemetry.push({
        step: 8 - guard,
        positionId,
        roll,
        rollSource,
        singleDieRemaining: ready.length === 1,
        planLength,
        planIndex: planIdx,
        planSource: 'turn-plan',
        hintCount: allHintsCount,
        hintRankUsed,
        mappedOriginId,
        usedFallback: true,
        fallbackReason: 'no-executable-origin',
        postState: workingGame.stateKind,
        plannedFrom,
        plannedTo,
        plannedKind,
        legalOriginIds,
        mappingStrategy: matchStrategy,
        mappingOutcome: 'no-legal',
        activeDirection: dirSnap,
        barCount: barCnt,
        offCount: offCnt,
        readyMovesSample: sample,
      })
      logger.info('[AI] Fallback completion: no executable origin', {
        positionId,
        roll,
        planLength,
        planIndex: planIdx,
        postState: workingGame.stateKind,
      })
      break
    }

    // Ensure dice order consumes the intended die first (avoid CORE picking the other die)
    try {
      const cr = ((workingGame.activePlayer as any)?.dice?.currentRoll || []) as number[]
      if (
        typeof expectedDie === 'number' &&
        Array.isArray(cr) &&
        cr.length === 2 &&
        cr[0] !== cr[1] &&
        cr[1] === expectedDie &&
        cr[0] !== expectedDie
      ) {
        workingGame = CoreUtil.Game.switchDice(workingGame as any) as any
      }
    } catch {}

    // Execute via core to ensure correctness and win checks
    workingGame = CoreUtil.Game.executeAndRecalculate(
      workingGame,
      originIdToUse
    )
    // Build CORE legality snapshot for telemetry - use the CURRENT ready state (before execution)
    const dirSnap2 = (workingGame.activePlayer as any)?.direction || 'clockwise'
    const barCnt2 = ((workingGame.board as any)?.bar?.[dirSnap2]?.checkers || []).length
    const offCnt2 = ((workingGame.board as any)?.off?.[dirSnap2]?.checkers || []).length
    // Sample the ready moves that were available at decision time (before this step executed)
    const sample2: any[] = []
    for (const m of ready as any[]) {
      if (!Array.isArray(m.possibleMoves) || m.possibleMoves.length === 0) continue
      const pm = m.possibleMoves[0]
      const o = pm?.origin
      const d = pm?.destination
      const oPos = o?.position ? (o.position as any)[dirSnap2] : null
      const dPos = d?.position ? (d.position as any)[dirSnap2] : null
      sample2.push({ die: (m as any)?.dieValue, originPos: typeof oPos === 'number' ? oPos : null, destPos: typeof dPos === 'number' ? dPos : null, kind: (m as any)?.moveKind || (pm as any)?.moveKind })
      if (sample2.length >= 5) break
    }
    telemetry.push({
      step: 8 - guard,
      positionId,
      roll,
      rollSource,
      singleDieRemaining: ready.length === 1,
      planLength,
      planIndex: planIdx,
      planSource: 'turn-plan',
      hintCount: allHintsCount,
      hintRankUsed,
      mappedOriginId,
      usedFallback,
      fallbackReason,
      postState: workingGame.stateKind,
      plannedFrom,
      plannedTo,
      plannedKind,
      legalOriginIds,
      mappingStrategy: matchStrategy,
      mappingOutcome: usedFallback
        ? (mappedOriginId ? 'id-miss' : 'no-origin')
        : (matchStrategy !== 'none' ? 'ok' : 'no-origin'),
      expectedDie: expectedDie as number | undefined,
      matchedDie: matchedDie as number | undefined,
      activeDirection: dirSnap2,
      barCount: barCnt2,
      offCount: offCnt2,
      readyMovesSample: sample2,
    })
    logger.info('[AI] Step executed (turn-plan)', {
      positionId,
      roll,
      planLength,
      planIndex: planIdx,
      mappedOriginId,
      usedFallback,
      fallbackReason,
      postState: workingGame.stateKind,
    })

    // Always increment planIdx when there was a planned step, even if fallback was used.
    // This prevents the loop from retrying the same stale plan step after the board changes.
    if (stepFromPlan) {
      planIdx += 1
    }
    if (workingGame.stateKind === 'completed') break
  }

  const result: BackgammonGameRolling = workingGame as BackgammonGameRolling
  if (aiFallbackUsed || fallbackReasons.length > 0) {
    const primaryReason = (fallbackReasons[0] || 'unknown') as OverrideReason
    const info: OverrideInfo = {
      reasonCode: primaryReason,
      reasonText:
        primaryReason === 'plan-origin-not-legal'
          ? 'Planned origin not legal under current READY set'
          : primaryReason === 'core-move-mismatch'
          ? 'GNU planned step not present in CORE READY set (position/kind/die)'
          : primaryReason === 'mapping-failed'
          ? 'Failed to map GNU step to Nodots containers'
          : primaryReason === 'no-gnu-hints' || primaryReason === 'no-gnu-hints-or-mapping-failed'
          ? 'GNU returned no hints or mapping failed'
          : 'AI fallback was used',
    }
    Object.defineProperty(result as any, '__aiFallback', {
      value: info,
      enumerable: false,
      configurable: true,
    })
  }
  Object.defineProperty(result as any, '__aiTelemetry', {
    value: telemetry,
    enumerable: false,
    configurable: true,
  })
  if (fallbackReasons.length > 0) {
    Object.defineProperty(result as any, '__aiFallbackReasons', {
      value: fallbackReasons,
      enumerable: false,
      configurable: true,
    })
  }
  return result
}

// Export matching functions for testing
export { matchStepToReadyMove, findMatchingHint, PositionMatchResult }
