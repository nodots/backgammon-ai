/**
 * InProcessGnuProvider
 *
 * Implements the language-neutral AnalysisProvider contract (from
 * src/engine/contract.ts, re-exported out of @nodots/backgammon-engine-protocol)
 * by delegating to the in-process @nodots/gnubg-hints native addon.
 *
 * The contract's request/response shapes are re-authored data definitions that
 * intentionally match the shapes @nodots/gnubg-hints already produces
 * (Evaluation / MoveHint / MoveStep / DoubleHint / TakeHint), so the move-hint
 * path is a direct delegation with no reshaping.
 *
 * Boundary note: the contract HintRequest is positionId-based. The addon exposes
 * getHintsFromPositionId (used by the robot move path), but its cube decisions
 * (getDoubleHint/getTakeHint) require a decoded board that a positionId-only
 * request does not carry. Those methods, plus explain, therefore throw rather
 * than fabricate a result -- consistent with the no-silent-fallback rule. None
 * of them are on the robot move-execution path this cell routes.
 */

import { GnuBgHints } from '@nodots/gnubg-hints'
import type {
  AnalysisProvider,
  DoubleHint,
  Evaluation,
  Explanation,
  HealthStatus,
  HintRequest,
  MoveHint,
  ResignDecision,
  TakeHint,
} from '../engine/contract.js'

const NOT_SUPPORTED = (method: string): Error =>
  new Error(
    `[AI] InProcessGnuProvider.${method} is not supported: the positionId-based ` +
      `contract request does not carry the board the in-process GNU addon requires ` +
      `for this decision. Refusing to fabricate a result.`
  )

export class InProcessGnuProvider implements AnalysisProvider {
  /**
   * Return ranked move hints for the position. Delegates directly to the addon
   * positionId path -- the same call the robot move planner used before this
   * abstraction, with identical arguments.
   */
  async getMoveHints(req: HintRequest, maxHints?: number): Promise<MoveHint[]> {
    // Contract MoveHint and gnubg MoveHint are the same shape; the addon result
    // is returned unchanged.
    return GnuBgHints.getHintsFromPositionId(
      req.positionId,
      req.dice,
      maxHints,
      req.activePlayerDirection,
      req.activePlayerColor
    )
  }

  /**
   * Position evaluation, derived from the top-ranked move hint's evaluation.
   * Throws when the position yields no legal move (no evaluation to report).
   */
  async evaluate(req: HintRequest): Promise<Evaluation> {
    const hints = await this.getMoveHints(req, 1)
    if (!hints || hints.length === 0) {
      throw new Error(
        `[AI] InProcessGnuProvider.evaluate: no hints returned for position ${req.positionId}`
      )
    }
    return hints[0].evaluation
  }

  async getDoubleHint(_req: HintRequest): Promise<DoubleHint> {
    throw NOT_SUPPORTED('getDoubleHint')
  }

  async getTakeHint(_req: HintRequest): Promise<TakeHint> {
    throw NOT_SUPPORTED('getTakeHint')
  }

  async getResignDecision(_req: HintRequest): Promise<ResignDecision> {
    throw NOT_SUPPORTED('getResignDecision')
  }

  async explain(_req: HintRequest): Promise<Explanation> {
    throw NOT_SUPPORTED('explain')
  }

  async health(): Promise<HealthStatus> {
    await GnuBgHints.initialize()
    return {
      status: 'ok',
      engineName: 'gnubg',
      engineVersion: 'in-process',
      // Literal rather than an imported PROTOCOL_VERSION value: the protocol
      // package ships an import-only exports map, so a runtime value import of
      // the contract module is unresolvable under this repo's CJS Jest resolver.
      // The type binds this to HealthStatus.protocolVersion, so a protocol
      // version bump fails the build here.
      protocolVersion: '1',
    }
  }
}

/**
 * Shared default instance. The robot move planner and the package public
 * surface both consume this single instance, mirroring the gnubgHints singleton
 * pattern already used in this package.
 */
export const inProcessGnuProvider = new InProcessGnuProvider()
