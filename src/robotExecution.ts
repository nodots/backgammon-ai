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

  const planPositionId = workingGame.gnuPositionId
  let plan: MoveStep[] = []
  try {
    const hints = await GnuBgHints.getHintsFromPositionId(planPositionId, roll, 1)
    const hint = hints && hints[0]
    plan = hint?.moves || []
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

    // Validate planned origin
    const legalOriginIds: string[] = []
    const isPlanOriginLegal = mappedOriginId
      ? ready.some(
          (m) =>
            Array.isArray(m.possibleMoves) &&
            m.possibleMoves.some((pm: any) => {
              const id = pm?.origin?.id
              if (id) legalOriginIds.push(id)
              return id === mappedOriginId
            })
        )
      : false

    let originIdToUse: string | null = null
    let usedFallback = false
    let fallbackReason: string | undefined
    if (isPlanOriginLegal && mappedOriginId) {
      originIdToUse = mappedOriginId
    } else {
      // Attempt position-based mapping before declaring fallback (origin+destination+kind match)
      let posMatchedId: string | null = null
      let expectedDie: number | undefined
      let matchedDie: number | undefined
      const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
      for (const m of ready) {
        if (!Array.isArray(m.possibleMoves)) continue
        for (const pm of m.possibleMoves) {
          const org = pm?.origin
          const dst = pm?.destination
          if (!org || !dst) continue
          // Planned reentry: origin must be bar; optional destination position check
          if (plannedKind === 'reenter' && org.kind === 'bar') {
            if (typeof plannedTo === 'number') {
              const dpos = (dst as any)?.position?.[dir]
              if (typeof dpos === 'number' && dpos === plannedTo) {
                expectedDie = plannedTo
                matchedDie = (pm as any)?.dieValue
                if (typeof matchedDie === 'number' && matchedDie !== expectedDie) {
                  continue
                }
                posMatchedId = org.id
                break
              }
            } else {
              posMatchedId = org.id
              break
            }
          }
          // Planned bear-off: destination must be off; check origin position
          if (plannedKind === 'bear-off' && (dst as any)?.kind === 'off') {
            if (typeof plannedFrom === 'number') {
              const opos = (org as any)?.position?.[dir]
              if (typeof opos === 'number' && opos === plannedFrom) {
                // Expected die is typically plannedFrom; allow pm.dieValue >= plannedFrom (higher die allowed when no higher checkers)
                expectedDie = plannedFrom
                matchedDie = (pm as any)?.dieValue
                if (typeof matchedDie === 'number' && matchedDie < expectedDie) {
                  continue
                }
                posMatchedId = org.id
                break
              }
            }
          }
          // Planned point-to-point: check both origin and destination positions
          if (plannedKind === 'point-to-point') {
            const opos = (org as any)?.position?.[dir]
            const dpos = (dst as any)?.position?.[dir]
            if (
              typeof plannedFrom === 'number' &&
              typeof plannedTo === 'number' &&
              typeof opos === 'number' &&
              typeof dpos === 'number' &&
              opos === plannedFrom &&
              dpos === plannedTo
            ) {
              // Expected die is absolute difference (relative to mover perspective)
              expectedDie = Math.abs(plannedFrom - plannedTo)
              matchedDie = (pm as any)?.dieValue
              if (typeof matchedDie === 'number' && matchedDie !== expectedDie) {
                continue
              }
              posMatchedId = org.id
              break
            }
          }
        }
        if (posMatchedId) break
      }
      if (posMatchedId) {
        // Position-based mapping succeeded; do not treat as override
        originIdToUse = posMatchedId
        // Update mapping telemetry fields to reflect position-based match
        mappedOriginId = posMatchedId
        // We intentionally do NOT set usedFallback/aiFallbackUsed here
      } else {
      // Fallback: planned step could not be matched by id or position+die
      // Treat as CORE move mismatch when we had a planned step
      aiFallbackUsed = true
      usedFallback = true
      fallbackReason = stepFromPlan ? 'core-move-mismatch' : 'no-gnu-hints-or-mapping-failed'
      if (fallbackReason) fallbackReasons.push(fallbackReason)
      try {
        if (fallbackReason === 'core-move-mismatch') {
          const diag = {
            ts: new Date().toISOString(),
            gameId: (workingGame as any)?.id,
            positionId,
            roll,
            dir: (workingGame.activePlayer as any)?.direction || 'clockwise',
            planned: { from: plannedFrom, to: plannedTo, kind: plannedKind },
            readyMovesSample: (ready as any[]).slice(0, 5).map((m: any) => {
              const pm = Array.isArray(m.possibleMoves) && m.possibleMoves[0]
              const oPos = pm?.origin?.position?.[(workingGame.activePlayer as any)?.direction || 'clockwise']
              const dPos = pm?.destination?.position?.[(workingGame.activePlayer as any)?.direction || 'clockwise']
              return { die: m?.dieValue, originPos: typeof oPos === 'number' ? oPos : null, destPos: typeof dPos === 'number' ? dPos : null, kind: m?.moveKind || pm?.moveKind }
            }),
          }
          const outDir = path.join(process.cwd(), 'scripts', 'diagnostics')
          const outFile = path.join(outDir, 'core-mismatch.log')
          try { fs.mkdirSync(outDir, { recursive: true }) } catch {}
          fs.appendFile(outFile, JSON.stringify(diag) + '\n', () => {})
        }
      } catch {}
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
        hintCount: planLength > 0 ? 1 : 0,
        mappedOriginId,
        usedFallback: true,
        fallbackReason: 'no-executable-origin',
        postState: workingGame.stateKind,
        plannedFrom,
        plannedTo,
        plannedKind,
        legalOriginIds,
        mappingStrategy: mappedOriginId ? 'id' : 'none',
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
    // Build CORE legality snapshot for telemetry
    const dirSnap2 = (workingGame.activePlayer as any)?.direction || 'clockwise'
    const barCnt2 = ((workingGame.board as any)?.bar?.[dirSnap2]?.checkers || []).length
    const offCnt2 = ((workingGame.board as any)?.off?.[dirSnap2]?.checkers || []).length
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
      hintCount: planLength > 0 ? 1 : 0,
      mappedOriginId,
      usedFallback,
      fallbackReason,
      postState: workingGame.stateKind,
      plannedFrom,
      plannedTo,
      plannedKind,
      legalOriginIds,
      mappingStrategy: mappedOriginId
        ? (isPlanOriginLegal ? 'id' : (originIdToUse && originIdToUse === mappedOriginId ? 'position' : 'rehint'))
        : 'none',
      mappingOutcome: usedFallback
        ? (mappedOriginId ? 'id-miss' : 'no-origin')
        : (mappedOriginId ? ((isPlanOriginLegal || (originIdToUse && originIdToUse === mappedOriginId)) ? 'ok' : 'ok-rehint') : 'no-origin'),
      expectedDie: expectedDie as any,
      matchedDie: matchedDie as any,
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

    if (!usedFallback && stepFromPlan) {
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
