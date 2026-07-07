/**
 * NeuralAIProvider
 *
 * Host-side RobotAIProvider for the first-party Nodots neural engine. It drives a
 * complete robot turn by talking to the neural /v1 HTTP service (the same
 * black-box AnalysisProvider contract the reference vendor implements) through
 * HttpEngineProvider, then executes the returned play against CORE.
 *
 * Two boundaries are honored:
 *  - The neural engine is reached ONLY over HTTP via HttpEngineProvider. No
 *    in-process neural code is imported here; the engine stays a swappable
 *    plugin behind @nodots/backgammon-engine-protocol.
 *  - NO SILENT FALLBACK (CLAUDE.md). The vendor play is validated against CORE's
 *    enumerated legal plays (legalMoveResolver) inside HttpEngineProvider, and
 *    each executed step is re-matched to a CORE ready move; an unmatched step
 *    throws with diagnostics rather than substituting a different move.
 *
 * Registered under the `nn-*@nodots.com` robot email prefix in RobotAIRegistry.
 */

import type {
  BackgammonColor,
  BackgammonDieValue,
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonMoveDirection,
  BackgammonMoveReady,
  BackgammonMoveSkeleton,
  BackgammonPlayMoving,
  BackgammonPlayer,
} from '@nodots/backgammon-types'
import type { RobotAIProvider } from '@nodots/backgammon-core'
import type { HintRequest, MoveHint, MoveStep } from '../engine/contract.js'
import {
  HttpEngineProvider,
  type HttpEngineProviderConfig,
  type LegalMoveResolver,
} from './HttpEngineProvider.js'

// Lazy CORE imports mirror robotExecution's pattern: break the ai<->core cycle
// and keep the module importable without eagerly loading CORE.
let Core: any = null
let Board: any = null
let exportToGnuPositionIdFn: any = null
const getCore = async (): Promise<any> => {
  if (!Core) Core = await import('@nodots/backgammon-core')
  return Core
}
const getBoard = async (): Promise<any> => {
  if (!Board) Board = (await getCore()).Board
  return Board
}
const getExportToGnuPositionId = async (): Promise<
  (game: BackgammonGameMoving) => string
> => {
  if (!exportToGnuPositionIdFn) {
    exportToGnuPositionIdFn = (await getCore()).exportToGnuPositionId
  }
  return exportToGnuPositionIdFn
}

// matchStepToReadyMove lives in robotExecution (forbidden to edit, safe to
// import). It matches a plan step to a CORE ready move by origin/destination
// position and die, the same validation the GNU path uses.
let matchStepToReadyMoveFn:
  | ((
      step: MoveStep,
      ready: unknown[],
      dir: BackgammonMoveDirection,
      mappedOriginId: string | null,
    ) => {
      matched: boolean
      originId: string | null
      desiredDestinationId: string | null
      matchedDie?: number
    })
  | null = null
const getMatchStepToReadyMove = async (): Promise<
  NonNullable<typeof matchStepToReadyMoveFn>
> => {
  if (!matchStepToReadyMoveFn) {
    const mod = await import('../robotExecution.js')
    matchStepToReadyMoveFn = mod.matchStepToReadyMove
  }
  return matchStepToReadyMoveFn
}

/** Default location of the neural /v1 service; override with NEURAL_ENGINE_URL. */
const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8080'
const ENGINE_ID = 'nodots-neural'
/** Loop ceiling: a turn is at most four steps (doubles); guard against cycles. */
const TURN_GUARD = 8

/** Map a CORE possibleMove skeleton to a protocol MoveStep (mover's numbering). */
function skeletonToStep(
  skeleton: BackgammonMoveSkeleton,
  direction: BackgammonMoveDirection,
): MoveStep {
  const { origin, destination } = skeleton
  const fromBar = origin.kind === 'bar'
  const toOff = destination.kind === 'off'
  // Protocol convention: bar is from=0, off is to=0 (matches the neural engine's
  // KernelPosition encoding). Points carry their own directional position.
  const from = fromBar ? 0 : (origin.position as Record<string, number>)[direction]
  const to = toOff ? 0 : (destination.position as Record<string, number>)[direction]
  const moveKind = fromBar ? 'reenter' : toOff ? 'bear-off' : 'point-to-point'
  return {
    from,
    to,
    moveKind,
    isHit: false,
    // player color is not consulted by findMatchingHint; fill from direction.
    player: direction === 'clockwise' ? 'white' : 'black',
    fromContainer: fromBar ? 'bar' : 'point',
    toContainer: toOff ? 'off' : 'point',
  }
}

/** A play threaded through the enumeration DFS. */
interface EnumeratedPlay {
  steps: MoveStep[]
  board: unknown
}

/** Order-sensitive key for a play's from/to sequence. */
function playKey(steps: readonly MoveStep[]): string {
  return steps.map((s) => `${s.from}/${s.to}`).join(',')
}

export interface NeuralProviderOptions {
  /** Base URL of the neural /v1 service. Default: NEURAL_ENGINE_URL or localhost. */
  baseUrl?: string
  /** Env-var name holding the API key. Default: NEURAL_ENGINE_API_KEY. */
  apiKeyRef?: string
  /** Env-var name holding the HMAC signing secret (optional). */
  hmacSecretRef?: string
  /** Per-request timeout (ms). */
  timeoutMs?: number
}

export class NeuralAIProvider implements RobotAIProvider {
  private readonly baseUrl: string
  private readonly apiKeyRef: string
  private readonly hmacSecretRef?: string
  private readonly timeoutMs?: number

  constructor(options: NeuralProviderOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.NEURAL_ENGINE_URL ?? DEFAULT_ENGINE_URL
    this.apiKeyRef = options.apiKeyRef ?? 'NEURAL_ENGINE_API_KEY'
    this.hmacSecretRef = options.hmacSecretRef ?? process.env.NEURAL_ENGINE_HMAC_REF
    this.timeoutMs = options.timeoutMs
  }

  /**
   * Enumerate CORE's legal FULL plays for a moving game as protocol MoveHint[].
   * Composes single-die legal steps (Board.getPossibleMoves) into full turns via
   * Board.moveChecker, applying backgammon's use-max-dice and higher-die rules.
   * This is the CORE-enumeration source HttpEngineProvider validates against.
   */
  private async enumerateLegalPlays(
    game: BackgammonGameMoving,
  ): Promise<MoveHint[]> {
    const BoardUtil = await getBoard()
    const player = game.activePlayer as BackgammonPlayer
    const direction = player.direction
    const ready = (game.activePlay?.moves ?? []).filter(
      (m: { stateKind: string }) => m.stateKind === 'ready',
    ) as BackgammonMoveReady[]
    const d1 = (ready[0]?.dieValue ?? 1) as BackgammonDieValue
    const d2 = (ready[1]?.dieValue ?? d1) as BackgammonDieValue

    // Doubles are a single ordered sequence of four; a non-double is tried both
    // orders because each can reach turns the other cannot.
    const sequences: BackgammonDieValue[][] =
      d1 === d2 ? [[d1, d1, d1, d1]] : [
        [d1, d2],
        [d2, d1],
      ]

    const terminals: EnumeratedPlay[] = []
    const walk = (
      board: unknown,
      remaining: BackgammonDieValue[],
      steps: MoveStep[],
    ): void => {
      if (remaining.length === 0) {
        terminals.push({ steps, board })
        return
      }
      const [face, ...rest] = remaining
      const skeletons = BoardUtil.getPossibleMoves(
        board,
        player,
        face,
      ) as BackgammonMoveSkeleton[]
      if (skeletons.length === 0) {
        terminals.push({ steps, board })
        return
      }
      for (const skeleton of skeletons) {
        const nextBoard = BoardUtil.moveChecker(
          board,
          skeleton.origin,
          skeleton.destination,
          direction,
        )
        walk(nextBoard, rest, [...steps, skeletonToStep(skeleton, direction)])
      }
    }
    for (const seq of sequences) walk(game.board, seq, [])

    const maxSteps = terminals.reduce((m, t) => Math.max(m, t.steps.length), 0)
    let kept = terminals.filter((t) => t.steps.length === maxSteps)
    // Higher-die rule: when only one die is playable, a play using the larger
    // die makes any smaller-die-only play illegal.
    if (maxSteps === 1 && d1 !== d2) {
      const larger = Math.max(d1, d2)
      const usesLarger = (t: EnumeratedPlay): boolean => {
        const s = t.steps[0]
        const die =
          s.moveKind === 'reenter'
            ? 25 - s.to
            : s.moveKind === 'bear-off'
              ? undefined
              : s.from - s.to
        return die === larger
      }
      if (kept.some(usesLarger)) kept = kept.filter(usesLarger)
    }

    // De-dupe by play key and wrap as MoveHints. Evaluation is a placeholder:
    // findMatchingHint consumes only `moves`, never the equity fields.
    const seen = new Set<string>()
    const hints: MoveHint[] = []
    for (const t of kept) {
      const key = playKey(t.steps)
      if (seen.has(key)) continue
      seen.add(key)
      hints.push({
        moves: t.steps,
        evaluation: {
          win: 0,
          winGammon: 0,
          winBackgammon: 0,
          loseGammon: 0,
          loseBackgammon: 0,
          equity: 0,
        },
        equity: 0,
        rank: hints.length + 1,
        difference: 0,
      })
    }
    return hints
  }

  /** Build an HttpEngineProvider whose legalMoveResolver enumerates CORE plays. */
  private buildProvider(game: BackgammonGameMoving): HttpEngineProvider {
    const legalMoveResolver: LegalMoveResolver = async () =>
      this.enumerateLegalPlays(game)
    const config: HttpEngineProviderConfig = {
      baseUrl: this.baseUrl,
      apiKeyRef: this.apiKeyRef,
      engineId: ENGINE_ID,
      legalMoveResolver,
      ...(this.hmacSecretRef ? { hmacSecretRef: this.hmacSecretRef } : {}),
      ...(typeof this.timeoutMs === 'number' ? { timeoutMs: this.timeoutMs } : {}),
    }
    return new HttpEngineProvider(config)
  }

  /** Build the positionId-based HintRequest for the current game + roll. */
  private async buildHintRequest(
    game: BackgammonGameMoving,
  ): Promise<HintRequest> {
    const exportPid = await getExportToGnuPositionId()
    const positionId = exportPid(game)
    const ready = (game.activePlay?.moves ?? []).filter(
      (m: { stateKind: string }) => m.stateKind === 'ready',
    ) as BackgammonMoveReady[]
    const d1 = (ready[0]?.dieValue ?? 1) as BackgammonDieValue
    const d2 = (ready[1]?.dieValue ?? d1) as BackgammonDieValue
    const player = game.activePlayer as BackgammonPlayer
    return {
      positionId,
      dice: [d1, d2],
      activePlayerColor: player.color as BackgammonColor,
      activePlayerDirection: player.direction,
      cubeValue: 1,
      cubeOwner: null,
      matchScore: [0, 0],
      matchLength: 0,
      crawford: false,
      jacoby: false,
      beavers: false,
    }
  }

  /**
   * Execute a full robot turn: fetch the neural engine's play (validated legal
   * against CORE), then apply it step by step through CORE. Each step is matched
   * to a CORE ready move; an unmatched step throws (no silent fallback).
   */
  async executeRobotTurn(
    game: BackgammonGameMoving,
  ): Promise<BackgammonGameRolling> {
    if (!game.activePlayer.isRobot) {
      throw new Error(
        `NeuralAIProvider requires active player to be a robot, but got isRobot=${game.activePlayer.isRobot}`,
      )
    }

    const CoreUtil = await getCore()
    const BoardUtil = await getBoard()
    const matchStep = await getMatchStepToReadyMove()

    const provider = this.buildProvider(game)
    const request = await this.buildHintRequest(game)
    // One-shot plan: getMoveHints validates the returned play against CORE's
    // enumerated legal plays before it is trusted.
    const hints = await provider.getMoveHints(request, 5)
    const plan: MoveStep[] = hints[0]?.moves ?? []

    let workingGame: any = game
    let planIdx = 0
    let guard = TURN_GUARD

    while (guard-- > 0 && workingGame.stateKind === 'moving') {
      const moves = (workingGame.activePlay?.moves ?? []) as any[]
      // Larger die first so an ambiguous bear-off resolves to the larger die
      // (CORE's must-use-larger-die rule), matching the GNU path's ordering.
      const ready = moves
        .filter((m) => m.stateKind === 'ready')
        .sort((a, b) => (b.dieValue ?? 0) - (a.dieValue ?? 0))

      // Refresh possibleMoves from the current board; stored ones go stale after
      // each executed step.
      for (const rm of ready) {
        rm.possibleMoves = BoardUtil.getPossibleMoves(
          workingGame.board,
          workingGame.activePlay.player,
          rm.dieValue,
        )
      }

      const step = planIdx < plan.length ? plan[planIdx] : undefined
      if (ready.length === 0 || !step) {
        workingGame = CoreUtil.Game.checkAndCompleteTurn(workingGame)
        break
      }

      const direction = (workingGame.activePlayer?.direction ??
        'clockwise') as BackgammonMoveDirection
      const match = matchStep(step, ready, direction, null)
      if (!match.matched || !match.originId) {
        throw new Error(
          `[AI] NeuralAIProvider: neural plan step (from=${step.from}, to=${step.to}, ` +
            `kind=${step.moveKind}) has no matching CORE legal move for position ` +
            `${request.positionId}. Refusing to substitute a different move.`,
        )
      }

      workingGame = CoreUtil.Game.executeAndRecalculate(
        workingGame,
        match.originId,
        {
          desiredDestinationId: match.desiredDestinationId ?? undefined,
          expectedDieValue: match.matchedDie as BackgammonDieValue | undefined,
        },
      )
      planIdx++
    }

    if (workingGame.stateKind === 'moving') {
      workingGame = CoreUtil.Game.checkAndCompleteTurn(workingGame)
    }
    return workingGame as BackgammonGameRolling
  }

  /**
   * Select the best single move from a play. Delegates to the shared heuristic
   * selector (opening book / policy / strategic), identical to the GNU and
   * Nodots providers -- move selection here is provider-agnostic.
   */
  async selectBestMove(
    play: BackgammonPlayMoving,
    _playerUserId?: string,
  ): Promise<BackgammonMoveReady | undefined> {
    const { selectBestMove } = await import('../moveSelection.js')
    return selectBestMove(play)
  }
}
