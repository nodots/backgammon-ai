/**
 * V1 integration test -- a SEALED (black-box) engine plays over HTTP.
 *
 * Proves the platform end-to-end for issue nodots/backgammon#372:
 *
 *  1. A sealed engine, reached only through HTTP via HttpEngineProvider, plays a
 *     multi-turn sequence. Each turn's move is requested over the wire, validated
 *     against CORE's own legal-move enumeration (the legalMoveResolver is wired to
 *     @nodots/backgammon-core, NOT to any GNU addon), and then EXECUTED on the
 *     real CORE board -- the resulting board feeds the next turn.
 *  2. No-silent-fallback at the integration layer: when the sealed engine returns
 *     an ILLEGAL move, HttpEngineProvider THROWS IllegalVendorMoveError with full
 *     diagnostics rather than substituting a legal move.
 *  3. A slow engine trips the timeout throw -- again, no fallback.
 *
 * The engine is a mock in-process http.Server so the test is hermetic and
 * deterministic: it exercises the full fetch / header / JSON / AbortController
 * path without the native GNU addon or the real reference vendor. Every "legal"
 * answer the mock returns is drawn from the SAME CORE enumeration the resolver
 * validates against, so a legal answer is legal by construction and an illegal
 * answer is fabricated by the test.
 *
 * Follow-up (out of scope here): a browser E2E against the deployed stack, which
 * requires the real reference vendor + provisioned gnubg weights.
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  HintRequest,
  MoveHint,
  MoveResponse,
  MoveStep,
} from '../engine/contract.js'
import { HttpEngineProvider } from '../providers/HttpEngineProvider.js'
import { IllegalVendorMoveError } from '../engine/moveValidation.js'

// --- CORE (real legal-move enumeration) -----------------------------------
// Loaded via subpath dynamic import inside beforeAll. Three constraints from
// this repo's jest resolver: (a) the package ROOT specifier recurses the
// resolver to a stack overflow, so only `dist/**` subpaths are safe; (b) a
// TOP-LEVEL `await import` trips the same overflow, but the identical import
// inside a hook/test does not; (c) importing `dist/Player/index.js` also
// overflows -- so this test never imports Player. CORE's move enumeration reads
// only `color` and `direction` off the player, so a plain object suffices.
// `typeof import(...)` below is a type-only construct erased at runtime.
type CoreBoardModule = typeof import('@nodots/backgammon-core/dist/Board/index.js')
let Board: CoreBoardModule['Board']

beforeAll(async () => {
  ;({ Board } = await import('@nodots/backgammon-core/dist/Board/index.js'))
})

// CORE types are structurally rich; this test only touches a handful of fields
// (id/kind/position/checkers/color/direction), so the local aliases stay narrow.
type Container = {
  id: string
  kind: 'point' | 'bar' | 'off'
  position: { clockwise: number; counterclockwise: number }
  checkers: Array<{ color: 'white' | 'black' }>
}
type Skeleton = { origin: Container; destination: Container }
type BoardT = Parameters<typeof Board.getPossibleMoves>[0]
/** The only player fields CORE's enumeration reads. */
type MovingPlayer = {
  color: 'white' | 'black'
  direction: 'clockwise' | 'counterclockwise'
}

const movingPlayer = (
  color: 'white' | 'black',
  direction: 'clockwise' | 'counterclockwise'
): MovingPlayer => ({ color, direction })

/** Directional point/bar/off number in the moving player's own coordinates. */
const num = (c: Container, dir: 'clockwise' | 'counterclockwise'): number =>
  c.kind === 'point' ? c.position[dir] : c.kind === 'bar' ? 25 : 0

/** getPossibleMoves returns either an array or a {moves} wrapper. */
const movesForDie = (
  board: BoardT,
  player: MovingPlayer,
  die: number
): Skeleton[] => {
  const res = Board.getPossibleMoves(
    board,
    // CORE reads only color/direction here; a full BackgammonPlayer is not
    // needed and Player/index.js cannot be imported under this jest resolver.
    player as unknown as Parameters<typeof Board.getPossibleMoves>[1],
    die as 1 | 2 | 3 | 4 | 5 | 6
  )
  const arr = Array.isArray(res) ? res : res.moves
  return arr as unknown as Skeleton[]
}

interface EnumeratedPlay {
  steps: MoveStep[]
  board: BoardT
}

/**
 * Enumerate the COMPLETE legal plays for a two-die roll straight from CORE, by
 * DFS: play each die-1 skeleton, then each die-2 skeleton on the resulting
 * board (both orderings for a non-double). Each play carries its from/to steps
 * AND the board CORE produced by executing it -- so the caller can advance.
 */
const enumeratePlays = (
  board: BoardT,
  player: MovingPlayer,
  roll: [number, number]
): EnumeratedPlay[] => {
  const { direction: dir, color } = player
  const [a, b] = roll
  const orders: Array<[number, number]> = a === b ? [[a, a]] : [[a, b], [b, a]]

  const toStep = (m: Skeleton): MoveStep => {
    const from = num(m.origin, dir)
    const to = num(m.destination, dir)
    return {
      from,
      to,
      moveKind:
        m.origin.kind === 'bar'
          ? 'reenter'
          : m.destination.kind === 'off'
            ? 'bear-off'
            : 'point-to-point',
      isHit: false,
      player: color,
      fromContainer: m.origin.kind,
      toContainer: m.destination.kind,
    }
  }

  const plays: EnumeratedPlay[] = []
  for (const [first, second] of orders) {
    for (const m1 of movesForDie(board, player, first)) {
      const b1 = Board.moveChecker(
        board,
        // CORE's own skeleton origin/destination -- passed straight back.
        m1.origin as unknown as Parameters<typeof Board.moveChecker>[1],
        m1.destination as unknown as Parameters<typeof Board.moveChecker>[2],
        dir
      )
      const seconds = movesForDie(b1, player, second)
      if (seconds.length === 0) {
        plays.push({ steps: [toStep(m1)], board: b1 })
        continue
      }
      for (const m2 of seconds) {
        const b2 = Board.moveChecker(
          b1,
          m2.origin as unknown as Parameters<typeof Board.moveChecker>[1],
          m2.destination as unknown as Parameters<typeof Board.moveChecker>[2],
          dir
        )
        plays.push({ steps: [toStep(m1), toStep(m2)], board: b2 })
      }
    }
  }
  return plays
}

/** MoveHint from a play's steps -- shape the resolver hands to CORE's matcher. */
const toHint = (steps: MoveStep[]): MoveHint => ({
  moves: steps,
  evaluation: {
    win: 0.5,
    winGammon: 0,
    winBackgammon: 0,
    loseGammon: 0,
    loseBackgammon: 0,
    equity: 0,
  },
  equity: 0,
  rank: 0,
  difference: 0,
})

/** Count a color's checkers across every container -- conservation invariant. */
const checkerCount = (board: BoardT, color: 'white' | 'black'): number =>
  (Board.getCheckerContainers(board) as unknown as Container[]).reduce(
    (n, c) => n + c.checkers.filter((ck) => ck.color === color).length,
    0
  )

// --- mock sealed engine (in-process http.Server) --------------------------

const API_KEY = 'sealed-engine-key'
const secretResolver = (ref: string): string | undefined =>
  ref === 'API_KEY_REF' ? API_KEY : undefined

interface SealedEngine {
  url: string
  moveCalls: number
  /** Swap what /v1/move answers on the next call. */
  setMoveReply: (reply: MoveResponse | 'hang') => void
  close: () => Promise<void>
}

const startSealedEngine = async (
  initial: MoveResponse | 'hang'
): Promise<SealedEngine> => {
  let moveReply: MoveResponse | 'hang' = initial
  let moveCalls = 0
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      if (req.url === '/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'ok',
            engineName: 'sealed-mock',
            engineVersion: '0.0.0',
            protocolVersion: '1',
          })
        )
        return
      }
      if (req.url === '/v1/move') {
        moveCalls += 1
        if (moveReply === 'hang') return // never responds -> client aborts
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(moveReply))
        return
      }
      res.writeHead(404)
      res.end('not found')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    get moveCalls() {
      return moveCalls
    },
    setMoveReply: (reply) => {
      moveReply = reply
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  }
}

const makeProvider = (
  url: string,
  legalMoveResolver: (req: HintRequest) => Promise<MoveHint[]>,
  timeoutMs?: number
): HttpEngineProvider =>
  new HttpEngineProvider({
    baseUrl: url,
    apiKeyRef: 'API_KEY_REF',
    engineId: 'sealed-mock',
    secretResolver,
    legalMoveResolver,
    timeoutMs,
  })

const hintRequest = (
  color: 'white' | 'black',
  direction: 'clockwise' | 'counterclockwise',
  roll: [number, number]
): HintRequest => ({
  // positionId is opaque to validation here -- the resolver validates against
  // the CORE board, not this string. A stable label keeps diagnostics readable.
  positionId: `v1-int-${color}-${roll.join('')}`,
  dice: roll,
  activePlayerColor: color,
  activePlayerDirection: direction,
  cubeValue: 1,
  cubeOwner: null,
  matchScore: [0, 0],
  matchLength: 1,
  crawford: false,
  jacoby: true,
  beavers: false,
})

// --- tests -----------------------------------------------------------------

describe('V1 integration: sealed engine plays over HTTP', () => {
  it('plays a multi-turn sequence; every move validated legal by CORE and executable', async () => {
    const white = movingPlayer('white', 'clockwise')
    const black = movingPlayer('black', 'counterclockwise')

    // A fixed, deterministic opening line. Alternating players share one evolving
    // board -- each executed play is the next turn's starting position.
    const turns: Array<{
      player: MovingPlayer
      color: 'white' | 'black'
      direction: 'clockwise' | 'counterclockwise'
      roll: [number, number]
    }> = [
      { player: white, color: 'white', direction: 'clockwise', roll: [3, 1] },
      { player: black, color: 'black', direction: 'counterclockwise', roll: [6, 4] },
      { player: white, color: 'white', direction: 'clockwise', roll: [5, 2] },
      { player: black, color: 'black', direction: 'counterclockwise', roll: [5, 3] },
    ]

    const engine = await startSealedEngine({ moves: [] })
    try {
      let board = Board.createBoardForPlayers(
        'white',
        'black'
      ) as unknown as BoardT
      const played: string[] = []

      for (const turn of turns) {
        // CORE enumerates the complete legal plays for this real position.
        const legalPlays = enumeratePlays(board, turn.player, turn.roll)
        expect(legalPlays.length).toBeGreaterThan(0)

        // The sealed engine "chooses" one legal play; the resolver enumerates
        // the whole legal set. Both come from CORE, so legality is genuine.
        const chosen = legalPlays[0]
        engine.setMoveReply({
          moves: chosen.steps,
          equity: 0.1,
          candidates: [toHint(chosen.steps)],
        })
        const legalHints = legalPlays.map((p) => toHint(p.steps))

        const provider = makeProvider(engine.url, async () => legalHints)

        // Round trip over HTTP + CORE validation happens inside getMoveHints.
        const hints = await provider.getMoveHints(
          hintRequest(turn.color, turn.direction, turn.roll)
        )

        // The move survived validation and came back intact.
        const returned = hints[0].moves.map((m) => `${m.from}/${m.to}`)
        expect(returned).toEqual(chosen.steps.map((m) => `${m.from}/${m.to}`))

        // Executable: advance to the board CORE produced for the chosen play,
        // and assert it is a valid evolved position (checkers conserved).
        const before = board
        board = chosen.board
        expect(board).not.toBe(before)
        expect(checkerCount(board, turn.color)).toBe(15)
        expect(
          checkerCount(board, turn.color === 'white' ? 'black' : 'white')
        ).toBe(15)

        played.push(`${turn.color} ${turn.roll.join(',')}: ${returned.join(' ')}`)
      }

      // One HTTP /v1/move call per turn -- the sealed engine drove every move.
      expect(engine.moveCalls).toBe(turns.length)
      expect(played).toHaveLength(turns.length)
      // Each turn actually moved checkers (non-empty play).
      for (const line of played) expect(line).toMatch(/\d+\/\d+/)
    } finally {
      await engine.close()
    }
  })

  it('reports health over HTTP via GET /v1/health', async () => {
    const engine = await startSealedEngine({ moves: [] })
    try {
      const provider = makeProvider(engine.url, async () => [])
      const health = await provider.health()
      expect(health.status).toBe('ok')
      expect(health.engineName).toBe('sealed-mock')
    } finally {
      await engine.close()
    }
  })

  it('THROWS IllegalVendorMoveError with diagnostics when the sealed engine returns an illegal move (no silent fallback)', async () => {
    const white = movingPlayer('white', 'clockwise')
    const board = Board.createBoardForPlayers(
      'white',
      'black'
    ) as unknown as BoardT
    const roll: [number, number] = [3, 1]

    const legalPlays = enumeratePlays(board, white, roll)
    const legalHints = legalPlays.map((p) => toHint(p.steps))

    // 13/2 is NOT reachable with a 3 and a 1 from the opening -- fabricated.
    const illegalStep: MoveStep = {
      from: 13,
      to: 2,
      moveKind: 'point-to-point',
      isHit: false,
      player: 'white',
      fromContainer: 'point',
      toContainer: 'point',
    }
    // Guard: the fabricated move really is absent from CORE's legal set.
    expect(
      legalHints.some((h) =>
        h.moves.some((m) => m.from === 13 && m.to === 2)
      )
    ).toBe(false)

    const engine = await startSealedEngine({ moves: [illegalStep] })
    try {
      const provider = makeProvider(engine.url, async () => legalHints)
      const req = hintRequest('white', 'clockwise', roll)

      await expect(provider.getMoveHints(req)).rejects.toThrow(
        IllegalVendorMoveError
      )

      const err = await provider.getMoveHints(req).catch((e) => e)
      expect(err).toBeInstanceOf(IllegalVendorMoveError)
      expect(err.engineId).toBe('sealed-mock')
      expect(err.dice).toEqual(roll)
      expect(err.returnedMove).toHaveLength(1)
      expect(err.legalMoves.length).toBeGreaterThan(0)
      expect(err.message).toContain('13/2')
      expect(err.message).toContain('ILLEGAL move')
      expect(err.message).toContain('Refusing to fall back')
    } finally {
      await engine.close()
    }
  })

  it('THROWS on a slow sealed engine (timeout, no fallback)', async () => {
    const white = movingPlayer('white', 'clockwise')
    const board = Board.createBoardForPlayers(
      'white',
      'black'
    ) as unknown as BoardT
    const legalHints = enumeratePlays(board, white, [3, 1]).map((p) =>
      toHint(p.steps)
    )

    const engine = await startSealedEngine('hang')
    try {
      const provider = makeProvider(engine.url, async () => legalHints, 100)
      await expect(
        provider.getMoveHints(hintRequest('white', 'clockwise', [3, 1]))
      ).rejects.toThrow(/timed out after 100ms.*Refusing to fall back/s)
    } finally {
      await engine.close()
    }
  })
})
