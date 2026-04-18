/**
 * Robot Turn Execution with GNU Backgammon
 *
 * This module contains GNU-specific logic for executing complete robot turns.
 * It was moved from @nodots/backgammon-core to maintain separation of concerns
 * and keep GNU dependencies isolated to the AI package.
 */

import {
  BackgammonColor,
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonMoveDestination,
  BackgammonMoveDirection,
  BackgammonMoveOrigin,
  BackgammonRoll,
  BackgammonDieValue,
} from '@nodots/backgammon-types'
import type { OverrideInfo, OverrideReason, AITelemetryStep } from '@nodots/backgammon-types'
import type { SkillConfig } from '@nodots/backgammon-api-utils'
import { GnuBgHints, MoveStep } from '@nodots/gnubg-hints'
import type { HintConfig } from '@nodots/gnubg-hints'
import fs from 'fs'
import path from 'path'
import { logger as coreLogger } from '@nodots/backgammon-core'

// Lazy imports to break circular dependency (ESM-compatible)
let Core: any = null
let Board: any = null
let exportToGnuPositionIdFn: any = null
const getCore = async () => {
  if (!Core) {
    Core = await import('@nodots/backgammon-core')
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
const getExportToGnuPositionId = async () => {
  if (!exportToGnuPositionIdFn) {
    const core = await getCore()
    exportToGnuPositionIdFn = core.exportToGnuPositionId
  }
  return exportToGnuPositionIdFn
}

// Simple logger to avoid circular dependency issues
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
 * Convert SkillConfig to HintConfig for GNU Backgammon
 * Maps robot skill settings to GNU engine parameters
 */
const skillConfigToHintConfig = (skill: SkillConfig): Partial<HintConfig> => {
  return {
    evalPlies: skill.evalPlies ?? 2,
    moveFilter: skill.moveFilter ?? 2,
    usePruning: skill.usePruning ?? true,
    noise: skill.noise ?? 0,
  }
}

/**
 * Execute a complete robot turn using GNU Backgammon hints
 *
 * This function:
 * 1. Initializes GNU Backgammon engine
 * 2. Configures engine based on robot's skill level
 * 3. Requests hints for the current position
 * 4. Applies noise to hint selection (if configured)
 * 5. Executes the selected move sequence
 * 6. Transitions game state to rolling for next player
 *
 * @param game - Game in moving state with robot as active player
 * @param skillConfig - Optional skill configuration for the robot
 * @returns Game in rolling state ready for next player
 * @throws Error if gnuPositionId is missing
 * @throws Error if GNU Backgammon returns no hints
 * @throws Error if move execution fails
 */
export const executeRobotTurnWithGNU = async (
  game: BackgammonGameMoving,
  skillConfig?: SkillConfig | null
): Promise<BackgammonGameRolling> => {
  await GnuBgHints.initialize()

  // Configure GNU engine based on skill level
  if (skillConfig) {
    const hintConfig = skillConfigToHintConfig(skillConfig)
    await GnuBgHints.configure(hintConfig)
    logger.info('[AI] Configured GNU with skill settings:', {
      skillLevel: skillConfig.skillLevel,
      evalPlies: hintConfig.evalPlies,
      moveFilter: hintConfig.moveFilter,
      noise: skillConfig.noise,
    })
  }
  const CoreUtil = await getCore()

  let workingGame: any = game
  const telemetry: AITelemetryStep[] = []
  let guard = 8 // prevent infinite loops per turn

  // One-shot plan: ask GNU once for the full sequence and execute without re-asking mid-turn
  const startMoves = (workingGame.activePlay?.moves || []) as any[]
  const startReady = startMoves.filter((m) => m.stateKind === 'ready')
  const rollSource: 'one-shot' = 'one-shot'
  const d1 = (startReady[0]?.dieValue ?? 1) as BackgammonDieValue
  const d2 = (startReady[1]?.dieValue ?? d1) as BackgammonDieValue
  const roll: BackgammonRoll = [d1, d2]

  const exportToGnuPositionId = await getExportToGnuPositionId()

  const getPlanForGame = async (
    currentGame: BackgammonGameMoving,
    currentRoll: BackgammonRoll
  ): Promise<MoveStep[]> => {
    let planPositionId: string | undefined
    try {
      planPositionId = exportToGnuPositionId(currentGame)
    } catch (err) {
      logger.warn('[AI] Failed to compute gnuPositionId:', err)
      planPositionId = undefined
    }
    if (!planPositionId) {
      throw new Error('[AI] No position ID available - cannot get GNU hints')
    }

    const activePlayerDirection =
      ((currentGame.activePlayer as any)?.direction as BackgammonMoveDirection) ??
      'clockwise'
    const activePlayerColor =
      ((currentGame.activePlayer as any)?.color as BackgammonColor) ?? 'white'
    // GNU rNoise is the sole noise mechanism -- always request 1 hint
    const hints = await GnuBgHints.getHintsFromPositionId(
      planPositionId,
      currentRoll,
      1,
      activePlayerDirection,
      activePlayerColor
    )
    if (!hints || hints.length === 0) {
      return []
    }

    return hints[0]?.moves || []
  }

  // Get plan ONCE before the loop (true one-shot planning to avoid die-tracking bug #250)
  let plan: MoveStep[] = []
  try {
    plan = await getPlanForGame(workingGame, roll)
  } catch (err) {
    throw new Error(`[AI] Failed to get GNU hints: ${err instanceof Error ? err.message : String(err)}`)
  }
  let planIdx = 0
  const planLength = plan.length

  while (guard-- > 0 && workingGame.stateKind === 'moving') {
    const moves = (workingGame.activePlay?.moves || []) as any[]
    const ready = moves.filter((m) => m.stateKind === 'ready')
    // Debug: log start of iteration
    fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({
      startOfIteration: true,
      guardValue: guard,
      stateKind: workingGame.stateKind,
      totalMoves: moves.length,
      readyMoves: ready.length,
      planIdx
    }) + '\n')

    // Refresh possibleMoves for each ready move from the CURRENT board.
    // Stored possibleMoves can be stale after prior moves in the same
    // turn changed the board — same fix as NodotsAIProvider.
    const BoardUtil = await getBoard()
    for (const rm of ready) {
      rm.possibleMoves = BoardUtil.getPossibleMoves(
        workingGame.board,
        workingGame.activePlay.player,
        rm.dieValue
      )
    }

    // If no READY moves remain, let core decide turn completion
    if (ready.length === 0) {
      fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({ noReadyMoves: true, breakingLoop: true }) + '\n')
      workingGame = CoreUtil.Game.checkAndCompleteTurn(workingGame)
      break
    }

    // Next planned step (if any)
    const positionId = workingGame.gnuPositionId
    let mappedOriginId: string | null = null
    let plannedFrom: number | null = null
    let plannedTo: number | null = null
    let plannedKind: string | undefined
    let desiredDestinationId: string | null = null
    let expectedDieValue: BackgammonDieValue | undefined
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
    const barMoves = ready.filter(
      (m) =>
        Array.isArray(m.possibleMoves) &&
        m.possibleMoves.some((pm: any) => pm?.origin?.kind === 'bar')
    )
    const activeDir =
      (workingGame.activePlayer as any)?.direction || 'clockwise'
    const activeColor = (workingGame.activePlayer as any)?.color
    const barByDir =
      ((workingGame.board as any)?.bar?.[activeDir]?.checkers || []).length
    const barBothDirs =
      ((workingGame.board as any)?.bar?.clockwise?.checkers || []).filter(
        (c: any) => c?.color === activeColor
      ).length +
      ((workingGame.board as any)?.bar?.counterclockwise?.checkers || []).filter(
        (c: any) => c?.color === activeColor
      ).length
    logger.debug('[AI] Bar-first check', {
      barCount: barByDir,
      barCountByColor: barBothDirs,
      barMoves: barMoves.length,
      readyMoves: ready.length,
      plannedKind,
    })
    // Debug: write ready moves info to file
    const readyDebug = {
      timestamp: new Date().toISOString(),
      readyCount: ready.length,
      barMovesCount: barMoves.length,
      barByDir,
      barBothDirs,
      activeDir,
      activeColor,
      plannedKind,
      plannedTo,
      readyMoves: ready.map((m: any) => ({
        id: m.id,
        dieValue: m.dieValue,
        moveKind: m.moveKind,
        stateKind: m.stateKind,
        possibleMovesCount: m.possibleMoves?.length || 0,
        firstPossibleMove: m.possibleMoves?.[0] ? {
          originKind: m.possibleMoves[0]?.origin?.kind,
          originId: m.possibleMoves[0]?.origin?.id,
        } : null
      }))
    }
    fs.writeFileSync('/tmp/ready-debug.json', JSON.stringify(readyDebug, null, 2))
    // ALWAYS use position-based matching that validates both origin AND destination.
    // Simple origin ID matching is not sufficient because the same origin can have
    // multiple destinations with different dice (e.g., from position 6: 6→5 with die 1, 6→2 with die 4).
    if (barMoves.length > 0) {
      // Bar-first rule: if any bar reentry is available, ignore non-bar GNU plans.
      let barMatchedId: string | null = null
      const barDebugLog: string[] = []
      barDebugLog.push(`[BAR-DEBUG] Bar moves found: ${barMoves.length}, plannedKind: ${plannedKind}, plannedTo: ${plannedTo}, typeof plannedTo: ${typeof plannedTo}`)
      logger.info('[BAR-DEBUG] Bar moves found:', barMoves.length, 'plannedKind:', plannedKind, 'plannedTo:', plannedTo, 'typeof plannedTo:', typeof plannedTo)
      if (plannedKind === 'reenter') {
        const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
        logger.info('[BAR-DEBUG] Direction:', dir)
        for (const m of barMoves) {
          if (!Array.isArray(m.possibleMoves)) continue
          for (const pm of m.possibleMoves) {
            if (pm?.origin?.kind !== 'bar') continue
            const dpos = (pm as any)?.destination?.position?.[dir]
            logger.info('[BAR-DEBUG] Checking pm: dpos=', dpos, 'typeof dpos:', typeof dpos, 'plannedTo=', plannedTo, 'match:', dpos === plannedTo)
            if (
              typeof plannedTo === 'number' &&
              typeof dpos === 'number' &&
              dpos === plannedTo
            ) {
              barMatchedId = pm.origin.id
              desiredDestinationId = pm?.destination?.id ?? null
              expectedDieValue =
                (pm as any)?.dieValue ?? (m as any)?.dieValue
              logger.info('[BAR-DEBUG] Match found: barMatchedId=', barMatchedId, 'destId=', desiredDestinationId, 'die=', expectedDieValue)
              break
            }
          }
          if (barMatchedId) break
        }
      }
      if (!barMatchedId) {
        logger.info('[BAR-DEBUG] No match found, using fallback')
        const firstBarMove = barMoves.find((m) =>
          Array.isArray(m.possibleMoves)
        )
        const fallbackMove = firstBarMove?.possibleMoves?.[0]
        barMatchedId = fallbackMove?.origin?.id ?? null
        desiredDestinationId = fallbackMove?.destination?.id ?? null
        expectedDieValue =
          (fallbackMove as any)?.dieValue ?? (firstBarMove as any)?.dieValue
        logger.info('[BAR-DEBUG] Fallback: barMatchedId=', barMatchedId, 'destId=', desiredDestinationId, 'die=', expectedDieValue)
      }
      if (barMatchedId) {
        originIdToUse = barMatchedId
        mappedOriginId = barMatchedId
        logger.info('[BAR-DEBUG] Setting originIdToUse=', originIdToUse)
      }
      // Write debug info to file for analysis
      const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
      const debugInfo = {
        timestamp: new Date().toISOString(),
        barMovesCount: barMoves.length,
        plannedKind,
        plannedTo,
        typeofPlannedTo: typeof plannedTo,
        direction: dir,
        barMatchedId,
        desiredDestinationId,
        expectedDieValue,
        originIdToUse,
        possibleMoves: barMoves.flatMap((m: any) =>
          (m.possibleMoves || []).map((pm: any) => ({
            originKind: pm?.origin?.kind,
            dpos: pm?.destination?.position?.[dir],
            dieValue: pm?.dieValue
          }))
        )
      }
      fs.writeFileSync('/tmp/bar-debug.json', JSON.stringify(debugInfo, null, 2))
      logger.info('[BAR-DEBUG] Wrote debug info to /tmp/bar-debug.json')
    } else {
      {
      // Attempt position-based mapping (origin+destination+kind match)
      let posMatchedId: string | null = null
      const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
      for (const m of ready) {
        if (!Array.isArray(m.possibleMoves)) continue
        for (const pm of m.possibleMoves) {
          const org = pm?.origin
          const dst = pm?.destination
          if (!org || !dst) continue
          // Planned reentry: origin must be bar; check destination position
          if (plannedKind === 'reenter' && org.kind === 'bar') {
            const dpos = (dst as any)?.position?.[dir]
            if (typeof plannedTo === 'number' && typeof dpos === 'number' && dpos === plannedTo) {
              posMatchedId = org.id
              desiredDestinationId = dst.id
              expectedDieValue =
                (pm as any)?.dieValue ?? (m as any)?.dieValue
              break
            }
          }
          // Planned bear-off: destination must be off; check origin position
          if (plannedKind === 'bear-off' && (dst as any)?.kind === 'off') {
            const opos = (org as any)?.position?.[dir]
            if (typeof plannedFrom === 'number' && typeof opos === 'number' && opos === plannedFrom) {
              posMatchedId = org.id
              desiredDestinationId = dst.id
              expectedDieValue =
                (pm as any)?.dieValue ?? (m as any)?.dieValue
              break
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
              posMatchedId = org.id
              desiredDestinationId = dst.id
              expectedDieValue =
                (pm as any)?.dieValue ?? (m as any)?.dieValue
              break
            }
          }
        }
        if (posMatchedId) break
      }
      if (posMatchedId) {
        originIdToUse = posMatchedId
        mappedOriginId = posMatchedId
      } else {
        // GNU planned step could not be matched - dump to file and fail
        const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
        const mismatchDebug = {
          timestamp: new Date().toISOString(),
          planIdx,
          planLength,
          plannedFrom,
          plannedTo,
          plannedKind,
          direction: dir,
          readyMovesCount: ready.length,
          readyMoves: ready.map((m: any) => ({
            dieValue: m.dieValue,
            moveKind: m.moveKind,
            stateKind: m.stateKind,
            possibleMoves: (m.possibleMoves || []).map((pm: any) => ({
              originPos: pm?.origin?.position?.[dir],
              destPos: pm?.destination?.position?.[dir],
              originKind: pm?.origin?.kind,
              destKind: pm?.destination?.kind,
            }))
          }))
        }
        fs.writeFileSync('/tmp/step2-mismatch.json', JSON.stringify(mismatchDebug, null, 2))
        const color = (workingGame.activePlayer as any)?.color || 'unknown'
        const currentRoll = (workingGame.activePlayer as any)?.dice?.currentRoll
        logger.error('MISMATCH DIAGNOSTIC:')
        logger.error('  Active player: color=' + color + ', direction=' + dir)
        logger.error('  Current roll in game:', currentRoll)
        logger.error('  Roll used for GNU hints:', roll)
        logger.error('  Plan index:', planIdx, 'of', planLength)
        logger.error('  Full plan:', JSON.stringify(plan.map((s: any) => ({ from: s.from, to: s.to, kind: s.moveKind }))))
        logger.error('  GNU planned: from=' + plannedFrom + ', to=' + plannedTo + ', kind=' + plannedKind)
        logger.error(
          '  Bar-first: barCount=' +
            barByDir +
            ', barMoves=' +
            barMoves.length
        )
        logger.error('  CORE ready moves (count=' + ready.length + '):')
        for (const m of ready) {
          logger.error('    Move dieValue=' + (m as any).dieValue + ', stateKind=' + (m as any).stateKind + ', moveKind=' + (m as any).moveKind)
          if (!Array.isArray((m as any).possibleMoves)) {
            logger.error('      (no possibleMoves array)')
            continue
          }
          logger.error('      possibleMoves count=' + (m as any).possibleMoves.length)
          for (const pm of (m as any).possibleMoves) {
            const opos = (pm as any)?.origin?.position?.[dir]
            const dpos = (pm as any)?.destination?.position?.[dir]
            const dkind = (pm as any)?.destination?.kind
            const pmDie = (pm as any)?.dieValue
            logger.error('      origin=' + opos + ', dest=' + (dkind === 'off' ? 'OFF' : dpos) + ', pmDie=' + pmDie)
          }
        }
        const errorMsg = stepFromPlan
          ? `GNU planned move (from: ${plannedFrom}, to: ${plannedTo}, kind: ${plannedKind}) not found in CORE legal moves`
          : 'No GNU hints available and no plan to execute'
        throw new Error(`[AI] ${errorMsg}`)
      }
      }
    }

    if (!originIdToUse) {
      // No executable origin found - this is an error, not a fallback
      throw new Error(`[AI] No executable origin found for GNU planned move (planned: from=${plannedFrom}, to=${plannedTo}, kind=${plannedKind})`)
    }

    // Execute via core to ensure correctness and win checks
    const preExecState = workingGame.stateKind
    const preExecMoveCount = ((workingGame.activePlay?.moves || []) as any[]).filter((m: any) => m.stateKind === 'ready').length

    // Extract the actual CORE positions for the move we're about to execute.
    // These are the authoritative source for history recording (not the GNU plan).
    const dir = (workingGame.activePlayer as any)?.direction || 'clockwise'
    let execOriginPos: number | 'bar' | undefined
    let execDestPos: number | 'off' | undefined
    let execDie: number | undefined
    let execMoveKind: string | undefined
    let execIsHit = false
    for (const m of ready) {
      if (!Array.isArray((m as any).possibleMoves)) continue
      for (const pm of (m as any).possibleMoves) {
        if ((pm as any)?.origin?.id === originIdToUse) {
          const org = (pm as any)?.origin
          const dst = (pm as any)?.destination
          if (org?.kind === 'bar') {
            execOriginPos = 'bar'
            execMoveKind = 'reenter'
          } else {
            execOriginPos = org?.position?.[dir]
            execMoveKind = 'point-to-point'
          }
          if (dst?.kind === 'off') {
            execDestPos = 'off'
            execMoveKind = 'bear-off'
          } else {
            execDestPos = dst?.position?.[dir]
          }
          execDie = (m as any).dieValue
          execIsHit = (m as any).isHit || false
          break
        }
      }
      if (execOriginPos !== undefined) break
    }
    logger.info('[AI] EXECUTING: planIdx=' + planIdx + ', GNU planned=' + plannedFrom + '→' + plannedTo +
      ', CORE executing=' + execOriginPos + '→' + execDestPos + ' (die=' + execDie + ')')

    const moveOptions =
      desiredDestinationId || typeof expectedDieValue === 'number'
        ? {
            desiredDestinationId: desiredDestinationId ?? undefined,
            expectedDieValue: expectedDieValue,
          }
        : undefined
    logger.info('[BAR-DEBUG] About to execute: originIdToUse=', originIdToUse, 'moveOptions=', JSON.stringify(moveOptions))
    const preBarCount = ((workingGame.board as any)?.bar?.[(workingGame.activePlayer as any)?.direction]?.checkers || []).length
    const execDebug = {
      timestamp: new Date().toISOString(),
      planIdx,
      originIdToUse,
      moveOptions,
      preBarCount,
      plannedFrom,
      plannedTo,
      plannedKind,
    }
    fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify(execDebug) + '\n')
    workingGame = CoreUtil.Game.executeAndRecalculate(
      workingGame,
      originIdToUse,
      moveOptions
    )
    const postBarCount = ((workingGame.board as any)?.bar?.[(workingGame.activePlayer as any)?.direction]?.checkers || []).length
    fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({ postExec: true, postBarCount, stateKind: workingGame.stateKind, workingGameId: (workingGame as any).id }) + '\n')

    const postExecState = workingGame.stateKind
    const postExecMoveCount = ((workingGame.activePlay?.moves || []) as any[]).filter((m: any) => m.stateKind === 'ready').length
    logger.info('[AI] Move executed: preState=' + preExecState + ', postState=' + postExecState + ', readyMoves: ' + preExecMoveCount + ' -> ' + postExecMoveCount)
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
      planSource: 'one-shot',
      hintCount: planLength > 0 ? 1 : 0,
      mappedOriginId,
      usedFallback: false,
      postState: workingGame.stateKind,
      plannedFrom,
      plannedTo,
      plannedKind,
      // Actual executed positions from CORE (authoritative for history recording)
      executedFrom: execOriginPos,
      executedTo: execDestPos,
      executedDieValue: execDie,
      executedMoveKind: execMoveKind,
      executedIsHit: execIsHit,
      legalOriginIds,
      mappingStrategy: mappedOriginId
        ? (isPlanOriginLegal ? 'id' : 'position')
        : 'none',
      mappingOutcome: mappedOriginId ? 'ok' : 'no-origin',
      expectedDie: expectedDie as any,
      matchedDie: matchedDie as any,
      activeDirection: dirSnap2,
      barCount: barCnt2,
      offCount: offCnt2,
      readyMovesSample: sample2,
    })
    logger.info('[AI] Step executed (one-shot)', {
      positionId,
      roll,
      planLength,
      planIndex: planIdx,
      mappedOriginId,
      postState: workingGame.stateKind,
    })

    // Advance to next step in plan after successful execution
    fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({ beforePlanIdxIncrement: true, stepFromPlan: !!stepFromPlan, planIdx }) + '\n')
    if (stepFromPlan) {
      planIdx++
      fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({ afterPlanIdxIncrement: true, planIdx }) + '\n')
    }
    if (workingGame.stateKind === 'completed') break
    // Debug: log end-of-iteration state
    fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({
      endOfIteration: true,
      guardRemaining: guard,
      stateKind: workingGame.stateKind,
      willContinue: guard > 0 && workingGame.stateKind === 'moving'
    }) + '\n')
  }

  // Debug: log function exit
  fs.appendFileSync('/tmp/exec-debug.json', JSON.stringify({
    functionExit: true,
    finalStateKind: workingGame.stateKind,
    totalTelemetrySteps: telemetry.length
  }) + '\n')

  // CRITICAL FIX: Transition from 'moved' to 'rolling' state
  // checkAndCompleteTurn only transitions to 'moved', we need handleRobotMovedState
  // to call confirmTurn and transition to 'rolling' for the next player
  if (workingGame.stateKind === 'moved') {
    logger.info('[AI] Game in moved state, calling handleRobotMovedState to transition to rolling')
    workingGame = CoreUtil.Game.handleRobotMovedState(workingGame)
    logger.info('[AI] After handleRobotMovedState, stateKind:', workingGame.stateKind)
  }

  const result: BackgammonGameRolling = workingGame as BackgammonGameRolling
  Object.defineProperty(result as any, '__aiTelemetry', {
    value: telemetry,
    enumerable: false,
    configurable: true,
  })
  return result
}
