/**
 * HttpEngineProvider
 *
 * Implements the language-neutral AnalysisProvider contract (src/engine/contract.ts)
 * by calling a black-box vendor engine over HTTP:
 *
 *   POST /v1/move    -> getMoveHints / evaluate
 *   POST /v1/double  -> getDoubleHint
 *   POST /v1/take    -> getTakeHint
 *   POST /v1/resign  -> getResignDecision
 *   GET  /v1/health  -> health
 *
 * The vendor may implement its engine in any language behind this boundary and
 * depends only on the permissive @nodots/backgammon-engine-protocol package.
 *
 * Guarantees enforced here:
 *  - NO SILENT FALLBACK. Timeout, network error, or non-2xx status throws a
 *    diagnostic error. It never substitutes a GNU move or a default move.
 *  - Strict move validation. A configured legalMoveResolver enumerates the legal
 *    plays for a position; the vendor's chosen play is matched against them via
 *    assertVendorMoveLegal, which throws with full diagnostics on any mismatch.
 *  - Optional HMAC request signing (X-Nodots-Timestamp + X-Nodots-Signature).
 *  - Hard timeout ceiling: the effective per-request timeout is
 *    min(config.timeoutMs, HARD_TIMEOUT_MS) enforced via AbortController.
 */

import { createHmac } from 'node:crypto'
import type {
  AnalysisProvider,
  DoubleHint,
  DoubleResponse,
  Evaluation,
  Explanation,
  HealthResponse,
  HealthStatus,
  HintRequest,
  MoveHint,
  MoveResponse,
  ResignDecision,
  ResignResponse,
  TakeHint,
  TakeResponse,
} from '../engine/contract.js'
import { assertVendorMoveLegal } from '../engine/moveValidation.js'

/** Default per-request budget (ms). */
const DEFAULT_TIMEOUT_MS = 2_000
/** Absolute ceiling on any single request (ms). */
const HARD_TIMEOUT_MS = 10_000

/** Resolves a secret reference (e.g. an env-var name) to its value. */
export type SecretResolver = (ref: string) => string | undefined

/**
 * Enumerates the legal plays for a position, used ONLY to validate the vendor's
 * returned play. Supplied by the caller so the provider carries no dependency on
 * the native GNU addon. When omitted, move validation is skipped (the caller is
 * then responsible for validating downstream).
 */
export type LegalMoveResolver = (req: HintRequest) => Promise<MoveHint[]>

export interface HttpEngineProviderConfig {
  /** Vendor base URL, e.g. https://engine.vendor.example (no trailing /v1). */
  baseUrl: string
  /** Reference to the API key secret (resolved via secretResolver). */
  apiKeyRef: string
  /** Stable identifier for this vendor engine, sent as X-Nodots-Engine-Id. */
  engineId: string
  /** Per-request budget in ms. Clamped to <= HARD_TIMEOUT_MS. Default 2000. */
  timeoutMs?: number
  /** Reference to the HMAC signing secret. When set, requests are signed. */
  hmacSecretRef?: string
  /** Secret-reference resolver. Default: read process.env[ref]. */
  secretResolver?: SecretResolver
  /** Legal-move enumerator for strict validation. */
  legalMoveResolver?: LegalMoveResolver
  /** fetch implementation. Default: global fetch. Injectable for tests. */
  fetchImpl?: typeof fetch
}

const defaultSecretResolver: SecretResolver = (ref) => process.env[ref]

export class HttpEngineProvider implements AnalysisProvider {
  private readonly baseUrl: string
  private readonly apiKeyRef: string
  private readonly engineId: string
  private readonly timeoutMs: number
  private readonly hmacSecretRef?: string
  private readonly secretResolver: SecretResolver
  private readonly legalMoveResolver?: LegalMoveResolver
  private readonly fetchImpl: typeof fetch

  constructor(config: HttpEngineProviderConfig) {
    // Strip a trailing slash so `${baseUrl}/v1/...` never doubles up.
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiKeyRef = config.apiKeyRef
    this.engineId = config.engineId
    this.timeoutMs = Math.min(
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      HARD_TIMEOUT_MS
    )
    this.hmacSecretRef = config.hmacSecretRef
    this.secretResolver = config.secretResolver ?? defaultSecretResolver
    this.legalMoveResolver = config.legalMoveResolver
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  /**
   * Return ranked move hints for the position. Calls POST /v1/move, then (when a
   * legalMoveResolver is configured) validates the vendor's chosen play against
   * the enumerated legal plays. Throws on an illegal play -- never substitutes.
   */
  async getMoveHints(req: HintRequest, maxHints?: number): Promise<MoveHint[]> {
    const body = this.buildRequestBody(req, { includeDice: true, maxHints })
    const res = await this.post<MoveResponse>('/v1/move', body)

    if (!Array.isArray(res.moves)) {
      throw new Error(
        `[AI] HttpEngineProvider: vendor "${this.engineId}" returned no moves ` +
          `array for position ${req.positionId}. Body=${JSON.stringify(res)}`
      )
    }

    if (this.legalMoveResolver) {
      const legalMoves = await this.legalMoveResolver(req)
      // Throws IllegalVendorMoveError with full diagnostics on mismatch.
      await assertVendorMoveLegal(res.moves, legalMoves, {
        positionId: req.positionId,
        dice: req.dice,
        engineId: this.engineId,
      })
    }

    // Prefer the vendor's ranked candidates when present; otherwise synthesize a
    // single hint from the chosen play so callers always receive MoveHint[].
    if (Array.isArray(res.candidates) && res.candidates.length > 0) {
      return typeof maxHints === 'number'
        ? res.candidates.slice(0, maxHints)
        : res.candidates
    }
    return [this.synthesizeHint(res)]
  }

  /**
   * Position evaluation, derived from the top-ranked move hint (mirrors
   * InProcessGnuProvider). Throws when the position yields no move.
   */
  async evaluate(req: HintRequest): Promise<Evaluation> {
    const hints = await this.getMoveHints(req, 1)
    if (!hints || hints.length === 0) {
      throw new Error(
        `[AI] HttpEngineProvider.evaluate: no hints returned for position ${req.positionId}`
      )
    }
    return hints[0].evaluation
  }

  async getDoubleHint(req: HintRequest): Promise<DoubleHint> {
    // Cube decisions carry no meaningful dice (see protocol SPEC).
    const body = this.buildRequestBody(req, { includeDice: false })
    const res = await this.post<DoubleResponse>('/v1/double', body)
    // evaluation is not a top-level wire field; it rides on the top candidate
    // when the vendor exposes scoring. Source it there, never fabricate it.
    const top = res.candidates?.[0]
    return {
      action: res.action,
      takePoint: requireNumber(
        res.takePoint ?? top?.takePoint,
        'double.takePoint',
        this.engineId
      ),
      dropPoint: requireNumber(
        res.dropPoint ?? top?.dropPoint,
        'double.dropPoint',
        this.engineId
      ),
      evaluation: requireEvaluation(top?.evaluation, 'double', this.engineId),
      cubefulEquity: requireNumber(
        res.equity ?? top?.cubefulEquity,
        'double.equity',
        this.engineId
      ),
    }
  }

  async getTakeHint(req: HintRequest): Promise<TakeHint> {
    const body = this.buildRequestBody(req, { includeDice: false })
    const res = await this.post<TakeResponse>('/v1/take', body)
    const top = res.candidates?.[0]
    return {
      action: res.action,
      evaluation: requireEvaluation(top?.evaluation, 'take', this.engineId),
      takeEquity: requireNumber(
        res.takeEquity ?? top?.takeEquity,
        'take.takeEquity',
        this.engineId
      ),
      dropEquity: requireNumber(
        res.dropEquity ?? top?.dropEquity,
        'take.dropEquity',
        this.engineId
      ),
    }
  }

  async getResignDecision(req: HintRequest): Promise<ResignDecision> {
    const body = this.buildRequestBody(req, { includeDice: false })
    const res = await this.post<ResignResponse>('/v1/resign', body)
    return { action: res.action }
  }

  async explain(_req: HintRequest): Promise<Explanation> {
    // No /v1/explain surface in the protocol response set. Refuse to fabricate.
    throw new Error(
      `[AI] HttpEngineProvider.explain is not supported: the vendor HTTP ` +
        `surface exposes no explain endpoint.`
    )
  }

  async health(): Promise<HealthStatus> {
    const res = await this.get<HealthResponse>('/v1/health')
    return res
  }

  // --- internals -----------------------------------------------------------

  private synthesizeHint(res: MoveResponse): MoveHint {
    const equity = typeof res.equity === 'number' ? res.equity : 0
    const emptyEvaluation: Evaluation = {
      win: 0,
      winGammon: 0,
      winBackgammon: 0,
      loseGammon: 0,
      loseBackgammon: 0,
      equity,
    }
    return {
      moves: res.moves,
      evaluation: emptyEvaluation,
      equity,
      rank: 0,
      difference: 0,
    }
  }

  private buildRequestBody(
    req: HintRequest,
    opts: { includeDice: boolean; maxHints?: number }
  ): Record<string, unknown> {
    const { dice, ...rest } = req
    const base: Record<string, unknown> = {
      ...rest,
      engineId: this.engineId,
    }
    if (opts.includeDice) base.dice = dice
    if (typeof opts.maxHints === 'number') base.maxHints = opts.maxHints
    return base
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>('POST', path, JSON.stringify(body))
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path, undefined)
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: string | undefined
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(body ?? ''),
        body,
        signal: controller.signal,
      })
    } catch (err) {
      const aborted =
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      if (aborted) {
        throw new Error(
          `[AI] HttpEngineProvider: vendor "${this.engineId}" ${method} ${url} ` +
            `timed out after ${this.timeoutMs}ms. Refusing to fall back.`
        )
      }
      throw new Error(
        `[AI] HttpEngineProvider: vendor "${this.engineId}" ${method} ${url} ` +
          `network error: ${err instanceof Error ? err.message : String(err)}. ` +
          `Refusing to fall back.`
      )
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await safeText(res)
      throw new Error(
        `[AI] HttpEngineProvider: vendor "${this.engineId}" ${method} ${url} ` +
          `returned HTTP ${res.status}. Body=${text}. Refusing to fall back.`
      )
    }

    return (await res.json()) as T
  }

  private buildHeaders(body: string): Record<string, string> {
    const apiKey = this.secretResolver(this.apiKeyRef)
    if (!apiKey) {
      throw new Error(
        `[AI] HttpEngineProvider: API key reference "${this.apiKeyRef}" ` +
          `resolved to no value. Cannot authenticate to vendor "${this.engineId}".`
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Nodots-Engine-Id': this.engineId,
    }

    if (this.hmacSecretRef) {
      const secret = this.secretResolver(this.hmacSecretRef)
      if (!secret) {
        throw new Error(
          `[AI] HttpEngineProvider: HMAC secret reference "${this.hmacSecretRef}" ` +
            `resolved to no value. Cannot sign requests to vendor "${this.engineId}".`
        )
      }
      const timestamp = Date.now().toString()
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex')
      headers['X-Nodots-Timestamp'] = timestamp
      headers['X-Nodots-Signature'] = signature
    }

    return headers
  }
}

const requireNumber = (
  value: number | undefined,
  field: string,
  engineId: string
): number => {
  if (typeof value !== 'number') {
    throw new Error(
      `[AI] HttpEngineProvider: vendor "${engineId}" omitted required numeric ` +
        `field "${field}". Refusing to fabricate a value.`
    )
  }
  return value
}

const requireEvaluation = (
  evaluation: Evaluation | undefined,
  method: string,
  engineId: string
): Evaluation => {
  if (!evaluation) {
    throw new Error(
      `[AI] HttpEngineProvider: vendor "${engineId}" omitted required ` +
        `"evaluation" for ${method}. Refusing to fabricate a value.`
    )
  }
  return evaluation
}

const safeText = async (res: Response): Promise<string> => {
  try {
    return await res.text()
  } catch {
    return '(unreadable body)'
  }
}
