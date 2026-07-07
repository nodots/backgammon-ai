/**
 * NeuralAIProvider tests.
 *
 * Proves the host adapter drives a robot turn by talking to the neural /v1
 * service over HTTP (a real in-process mock server, no fetch mock) through
 * HttpEngineProvider, with the vendor play validated against CORE's enumerated
 * legal plays (legalMoveResolver) before any step executes.
 *
 * CORE is mocked (Board move-gen/apply, Game execution, positionId export) the
 * same way the GNU robot-execution tests mock it, so the test is hermetic and
 * exercises the adapter's wiring, enumeration, and no-silent-fallback contract
 * without a live CORE game or the native addon.
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// Force ESM emit so the top-level `await import` below is valid (ts-jest hybrid
// mode otherwise transforms some files to CJS, where top-level await is illegal).
export {}

// --- CORE mock -------------------------------------------------------------

// A minimal board carries a tag so the move-generation mock can return the
// right single-die steps for each intermediate board during enumeration.
type MockBoard = { _tag: string }

const point = (id: string, pos: number) => ({
  id,
  kind: 'point',
  position: { clockwise: pos, counterclockwise: pos },
})
// Single-die legal steps keyed by (boardTag, die). The opening 8/5 6/5 for a
// [3,1] roll: die 3 plays 8->5, die 1 plays 6->5, in either order.
const skeleton = (fromPos: number, toPos: number, die: number) => ({
  origin: point(`p${fromPos}`, fromPos),
  destination: point(`p${toPos}`, toPos),
  dieValue: die,
  direction: 'clockwise',
})
const STEPS: Record<string, ReturnType<typeof skeleton>[]> = {
  'start|3': [skeleton(8, 5, 3)],
  'start|1': [skeleton(6, 5, 1)],
  'start>p8|1': [skeleton(6, 5, 1)],
  'start>p6|3': [skeleton(8, 5, 3)],
}

const getPossibleMovesMock = jest.fn(
  (board: MockBoard, _player: unknown, die: number) =>
    STEPS[`${board._tag}|${die}`] ?? [],
)
const moveCheckerMock = jest.fn(
  (board: MockBoard, origin: { id: string }): MockBoard => ({
    _tag: `${board._tag}>${origin.id}`,
  }),
)

// Execution advances a small state machine: first origin (p8) leaves the die-1
// move ready; second (p6) empties the turn.
const executeAndRecalculateMock = jest.fn(
  (game: any, originId: string): any => {
    if (originId === 'p8') {
      return {
        ...game,
        board: { _tag: 'start>p8' },
        activePlay: { ...game.activePlay, moves: [readyMove(6, 5, 1)] },
        stateKind: 'moving',
      }
    }
    return {
      ...game,
      board: { _tag: 'done' },
      activePlay: { ...game.activePlay, moves: [] },
      stateKind: 'moving',
    }
  },
)
const checkAndCompleteTurnMock = jest.fn((game: any) => ({
  ...game,
  stateKind: 'rolling',
}))
const exportToGnuPositionIdMock = jest.fn(() => '4HPwATDgc/ABMA')
const noopLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

jest.unstable_mockModule('@nodots/backgammon-core', () => ({
  Board: {
    getPossibleMoves: getPossibleMovesMock,
    moveChecker: moveCheckerMock,
  },
  Game: {
    executeAndRecalculate: executeAndRecalculateMock,
    checkAndCompleteTurn: checkAndCompleteTurnMock,
  },
  exportToGnuPositionId: exportToGnuPositionIdMock,
  logger: noopLogger,
}))

// A ready move whose possibleMoves match a single-die step (refreshed each
// iteration by the getPossibleMoves mock, but seeded here too).
function readyMove(fromPos: number, toPos: number, die: number) {
  return {
    id: `move-${die}`,
    stateKind: 'ready',
    dieValue: die,
    moveKind: 'point-to-point',
    possibleMoves: [skeleton(fromPos, toPos, die)],
  }
}

// Top-level await import so the SUT's lazy `import('@nodots/backgammon-core')`
// binds to the mock registered above (same pattern the GNU robot-execution
// tests use). `export {}` below forces ESM emit under ts-jest hybrid mode.
const { NeuralAIProvider } = await import('../providers/NeuralAIProvider.js')

// --- mock neural /v1 server ------------------------------------------------

interface MockServer {
  url: string
  captured: { method: string; url: string; body: string }[]
  close: () => Promise<void>
}
async function startServer(
  handler: (body: string, res: http.ServerResponse) => void,
): Promise<MockServer> {
  const captured: MockServer['captured'] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      captured.push({ method: req.method ?? '', url: req.url ?? '', body })
      handler(body, res)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  }
}

const moveStep = (from: number, to: number) => ({
  from,
  to,
  moveKind: 'point-to-point',
  isHit: false,
  player: 'white',
  fromContainer: 'point',
  toContainer: 'point',
})

function makeGame() {
  const activePlayer = {
    id: 'p1',
    color: 'white',
    direction: 'clockwise',
    isRobot: true,
  }
  return {
    id: 'g1',
    stateKind: 'moving',
    board: { _tag: 'start' } as MockBoard,
    activePlayer,
    activePlay: {
      id: 'ap1',
      player: activePlayer,
      moves: [readyMove(8, 5, 3), readyMove(6, 5, 1)],
    },
  }
}

// --- tests -----------------------------------------------------------------

describe('NeuralAIProvider', () => {
  const servers: MockServer[] = []
  beforeEach(() => {
    process.env.NEURAL_ENGINE_API_KEY = 'test-key'
    jest.clearAllMocks()
  })
  afterAll(async () => {
    for (const s of servers) await s.close()
  })

  it('drives a full turn: fetches the play over HTTP and executes it via CORE', async () => {
    const server = await startServer((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          moves: [moveStep(8, 5), moveStep(6, 5)],
          equity: 0.1,
          candidates: [
            {
              moves: [moveStep(8, 5), moveStep(6, 5)],
              evaluation: {
                win: 0.5,
                winGammon: 0,
                winBackgammon: 0,
                loseGammon: 0,
                loseBackgammon: 0,
                equity: 0.1,
              },
              equity: 0.1,
              rank: 1,
              difference: 0,
            },
          ],
        }),
      )
    })
    servers.push(server)

    const provider = new NeuralAIProvider({ baseUrl: server.url })
    const result = await provider.executeRobotTurn(makeGame() as any)

    // The request hit the neural /v1/move endpoint with the exported positionId.
    expect(server.captured[0].method).toBe('POST')
    expect(server.captured[0].url).toBe('/v1/move')
    expect(JSON.parse(server.captured[0].body).positionId).toBe('4HPwATDgc/ABMA')
    // Both planned steps executed through CORE, in order.
    expect(executeAndRecalculateMock.mock.calls.map((c) => c[1])).toEqual([
      'p8',
      'p6',
    ])
    // Turn finished in rolling state.
    expect(result.stateKind).toBe('rolling')
  })

  it('throws (no silent fallback) when the engine returns an illegal play', async () => {
    const server = await startServer((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      // 13/2 is not among CORE's enumerated legal plays for this position.
      res.end(JSON.stringify({ moves: [moveStep(13, 2)] }))
    })
    servers.push(server)

    const provider = new NeuralAIProvider({ baseUrl: server.url })
    await expect(
      provider.executeRobotTurn(makeGame() as any),
    ).rejects.toThrow(/ILLEGAL move|Refusing to fall back/)
    // No move was executed.
    expect(executeAndRecalculateMock).not.toHaveBeenCalled()
  })

  it('refuses to run for a non-robot active player', async () => {
    const provider = new NeuralAIProvider({ baseUrl: 'http://127.0.0.1:1' })
    const game = makeGame() as any
    game.activePlayer.isRobot = false
    await expect(provider.executeRobotTurn(game)).rejects.toThrow(
      /to be a robot/,
    )
  })
})
