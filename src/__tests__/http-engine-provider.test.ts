/**
 * HttpEngineProvider unit tests.
 *
 * The vendor is a real in-process http.Server so the full request path exercises
 * fetch, headers, HMAC signing, AbortController timeouts and JSON round-tripping
 * -- no fetch mock. Each test drives the provider against a server whose handler
 * is swapped per case.
 */

import { createHmac } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  HintRequest,
  MoveHint,
  MoveResponse,
} from '../engine/contract.js'
import {
  HttpEngineProvider,
  type HttpEngineProviderConfig,
} from '../providers/HttpEngineProvider.js'
import { IllegalVendorMoveError } from '../engine/moveValidation.js'

// --- fixtures --------------------------------------------------------------

const API_KEY = 'test-api-key'
const HMAC_SECRET = 'test-hmac-secret'

const secretResolver = (ref: string): string | undefined =>
  ({ API_KEY_REF: API_KEY, HMAC_REF: HMAC_SECRET })[ref]

const baseRequest = (): HintRequest => ({
  positionId: '4HPwATDgc/ABMA',
  dice: [3, 1],
  activePlayerColor: 'white',
  activePlayerDirection: 'clockwise',
  cubeValue: 1,
  cubeOwner: null,
  matchScore: [0, 0],
  matchLength: 1,
  crawford: false,
  jacoby: true,
  beavers: false,
})

// A legal play 8/5 6/5 expressed as MoveStep[].
const legalPlaySteps = (): MoveResponse['moves'] => [
  {
    from: 8,
    to: 5,
    moveKind: 'point-to-point',
    isHit: false,
    player: 'white',
    fromContainer: 'point',
    toContainer: 'point',
  },
  {
    from: 6,
    to: 5,
    moveKind: 'point-to-point',
    isHit: false,
    player: 'white',
    fromContainer: 'point',
    toContainer: 'point',
  },
]

const legalHints = (): MoveHint[] => [
  {
    moves: legalPlaySteps(),
    evaluation: {
      win: 0.55,
      winGammon: 0.1,
      winBackgammon: 0.01,
      loseGammon: 0.05,
      loseBackgammon: 0.0,
      equity: 0.12,
    },
    equity: 0.12,
    rank: 0,
    difference: 0,
  },
]

interface CapturedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

/** A per-test mock vendor. handler returns [status, jsonBody] or delays. */
interface MockVendor {
  url: string
  captured: CapturedRequest[]
  close: () => Promise<void>
}

type Handler = (
  req: CapturedRequest,
  res: http.ServerResponse
) => void | Promise<void>

async function startVendor(handler: Handler): Promise<MockVendor> {
  const captured: CapturedRequest[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const captured1: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }
      captured.push(captured1)
      Promise.resolve(handler(captured1, res)).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500)
          res.end('handler error')
        }
      })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  }
}

const jsonReply =
  (status: number, payload: unknown): Handler =>
  (_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  }

function makeProvider(
  vendorUrl: string,
  overrides: Partial<HttpEngineProviderConfig> = {}
): HttpEngineProvider {
  return new HttpEngineProvider({
    baseUrl: vendorUrl,
    apiKeyRef: 'API_KEY_REF',
    engineId: 'test-vendor',
    secretResolver,
    ...overrides,
  })
}

// --- tests -----------------------------------------------------------------

describe('HttpEngineProvider', () => {
  it('round-trips a position to a move via POST /v1/move', async () => {
    const moveResponse: MoveResponse = {
      moves: legalPlaySteps(),
      equity: 0.12,
      candidates: legalHints(),
    }
    const vendor = await startVendor(jsonReply(200, moveResponse))
    try {
      const provider = makeProvider(vendor.url, {
        legalMoveResolver: async () => legalHints(),
      })
      const hints = await provider.getMoveHints(baseRequest())

      expect(hints).toHaveLength(1)
      expect(hints[0].moves.map((m) => `${m.from}/${m.to}`)).toEqual([
        '8/5',
        '6/5',
      ])
      // Request landed on the right endpoint with auth + engine-id headers.
      const call = vendor.captured[0]
      expect(call.method).toBe('POST')
      expect(call.url).toBe('/v1/move')
      expect(call.headers.authorization).toBe(`Bearer ${API_KEY}`)
      expect(call.headers['x-nodots-engine-id']).toBe('test-vendor')
      // No HMAC headers when hmacSecretRef is not configured.
      expect(call.headers['x-nodots-signature']).toBeUndefined()
      // Position was carried in the body.
      expect(JSON.parse(call.body).positionId).toBe('4HPwATDgc/ABMA')
    } finally {
      await vendor.close()
    }
  })

  it('synthesizes a single hint when the vendor returns no candidates', async () => {
    const vendor = await startVendor(
      jsonReply(200, { moves: legalPlaySteps(), equity: 0.2 })
    )
    try {
      const provider = makeProvider(vendor.url)
      const hints = await provider.getMoveHints(baseRequest())
      expect(hints).toHaveLength(1)
      expect(hints[0].equity).toBe(0.2)
    } finally {
      await vendor.close()
    }
  })

  it('throws IllegalVendorMoveError with diagnostics for an illegal move', async () => {
    const illegalMove: MoveResponse = {
      moves: [
        {
          from: 13,
          to: 2,
          moveKind: 'point-to-point',
          isHit: false,
          player: 'white',
          fromContainer: 'point',
          toContainer: 'point',
        },
      ],
    }
    const vendor = await startVendor(jsonReply(200, illegalMove))
    try {
      const provider = makeProvider(vendor.url, {
        legalMoveResolver: async () => legalHints(),
      })
      await expect(provider.getMoveHints(baseRequest())).rejects.toThrow(
        IllegalVendorMoveError
      )
      // Re-run to inspect the diagnostic payload.
      const err = await provider.getMoveHints(baseRequest()).catch((e) => e)
      expect(err).toBeInstanceOf(IllegalVendorMoveError)
      expect(err.positionId).toBe('4HPwATDgc/ABMA')
      expect(err.dice).toEqual([3, 1])
      expect(err.returnedMove).toHaveLength(1)
      expect(err.legalMoves).toHaveLength(1)
      expect(err.message).toContain('13/2')
      expect(err.message).toContain('Refusing to fall back')
    } finally {
      await vendor.close()
    }
  })

  it('throws (no fallback) when the request times out', async () => {
    // Handler never responds; provider must abort at timeoutMs.
    const vendor = await startVendor(() => {
      /* hang */
    })
    try {
      const provider = makeProvider(vendor.url, { timeoutMs: 100 })
      await expect(provider.getMoveHints(baseRequest())).rejects.toThrow(
        /timed out after 100ms.*Refusing to fall back/s
      )
    } finally {
      await vendor.close()
    }
  })

  it('throws (no fallback) on a 5xx response', async () => {
    const vendor = await startVendor(jsonReply(503, { error: 'overloaded' }))
    try {
      const provider = makeProvider(vendor.url)
      await expect(provider.getMoveHints(baseRequest())).rejects.toThrow(
        /HTTP 503.*Refusing to fall back/s
      )
    } finally {
      await vendor.close()
    }
  })

  it('throws (no fallback) on a network error to an unreachable host', async () => {
    // Reserved TEST-NET-1 address that refuses/blackholes connections fast
    // enough under the configured timeout.
    const provider = makeProvider('http://127.0.0.1:1', { timeoutMs: 500 })
    await expect(provider.getMoveHints(baseRequest())).rejects.toThrow(
      /Refusing to fall back/
    )
  })

  it('signs requests with HMAC headers when hmacSecretRef is configured', async () => {
    const vendor = await startVendor(
      jsonReply(200, { moves: legalPlaySteps() })
    )
    try {
      const provider = makeProvider(vendor.url, { hmacSecretRef: 'HMAC_REF' })
      await provider.getMoveHints(baseRequest())

      const call = vendor.captured[0]
      const timestamp = call.headers['x-nodots-timestamp']
      const signature = call.headers['x-nodots-signature']
      expect(typeof timestamp).toBe('string')
      expect(typeof signature).toBe('string')

      // Signature must verify over `timestamp + '.' + body`.
      const expected = createHmac('sha256', HMAC_SECRET)
        .update(`${timestamp}.${call.body}`)
        .digest('hex')
      expect(signature).toBe(expected)
    } finally {
      await vendor.close()
    }
  })

  it('reports health via GET /v1/health', async () => {
    const health = {
      status: 'ok',
      engineName: 'vendor-x',
      engineVersion: '9.9',
      protocolVersion: '1',
    }
    const vendor = await startVendor(jsonReply(200, health))
    try {
      const provider = makeProvider(vendor.url)
      const res = await provider.health()
      expect(res.engineName).toBe('vendor-x')
      expect(vendor.captured[0].method).toBe('GET')
      expect(vendor.captured[0].url).toBe('/v1/health')
    } finally {
      await vendor.close()
    }
  })

  it('throws when the API key reference resolves to nothing', async () => {
    const vendor = await startVendor(jsonReply(200, { moves: [] }))
    try {
      const provider = makeProvider(vendor.url, {
        secretResolver: () => undefined,
      })
      await expect(provider.getMoveHints(baseRequest())).rejects.toThrow(
        /API key reference/
      )
    } finally {
      await vendor.close()
    }
  })
})
