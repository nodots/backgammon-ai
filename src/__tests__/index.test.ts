import type {
  BackgammonBoard,
  BackgammonMoveReady,
  BackgammonPlayMoving,
  BackgammonPoint,
  BackgammonPoints,
} from '@nodots-llc/backgammon-types';
import { jest } from '@jest/globals';
import type { MoveHint } from '@nodots-llc/gnubg-hints';

let mockHints: MoveHint[] = []
const initializeMock = jest.fn().mockResolvedValue(undefined)
const getMoveHintsMock = jest.fn(async () => mockHints)

jest.unstable_mockModule('@nodots-llc/gnubg-hints', () => ({
  GnuBgHints: {
    initialize: initializeMock,
    configure: jest.fn(),
    getMoveHints: getMoveHintsMock,
    getDoubleHint: jest.fn(),
    getTakeHint: jest.fn(),
    shutdown: jest.fn(),
  },
  createHintRequestFromGame: () => ({
    board: { points: [], bar: {}, off: {} },
    dice: [0, 0],
    activePlayerColor: 'white',
    activePlayerDirection: 'clockwise',
    cubeValue: 1,
    cubeOwner: null,
    matchScore: [0, 0],
    matchLength: 0,
    crawford: false,
    jacoby: false,
    beavers: false,
  }),
}))

const { selectBestMove } = await import('../moveSelection.js')

describe('selectBestMove with GNU hints', () => {
  function createTestPlay(): BackgammonPlayMoving {
    const points = Array.from({ length: 24 }, (_, index) => ({
      id: `pt-${index + 1}`,
      kind: 'point' as const,
      position: {
        clockwise: (index + 1) as any,
        counterclockwise: (24 - index) as any,
      },
      checkers: [],
    })) as unknown as BackgammonPoints;

    const board: BackgammonBoard = {
      id: 'board-1',
      points,
      bar: {
        clockwise: {
          id: 'bar-cw',
          kind: 'bar' as const,
          direction: 'clockwise' as const,
          position: 'bar' as const,
          checkers: [],
        },
        counterclockwise: {
          id: 'bar-ccw',
          kind: 'bar' as const,
          direction: 'counterclockwise' as const,
          position: 'bar' as const,
          checkers: [],
        },
      },
      off: {
        clockwise: {
          id: 'off-cw',
          kind: 'off' as const,
          direction: 'clockwise' as const,
          position: 'off' as const,
          checkers: [],
        },
        counterclockwise: {
          id: 'off-ccw',
          kind: 'off' as const,
          direction: 'counterclockwise' as const,
          position: 'off' as const,
          checkers: [],
        },
      },
    };

    const player = {
      id: 'player-1',
      userId: 'da7eac85-cf8f-49f4-b97d-9f40d3171b36',
      color: 'white' as const,
      direction: 'clockwise' as const,
      stateKind: 'moving' as const,
      dice: {
        id: 'dice-1',
        color: 'white' as const,
        stateKind: 'rolled' as const,
        currentRoll: [5, 2] as [number, number],
        total: 7,
      },
      pipCount: 150,
      isRobot: true,
      rollForStartValue: 3 as any,
    };

    const move: BackgammonMoveReady = {
      id: 'move-1',
      player,
      dieValue: 5,
      stateKind: 'ready',
      moveKind: 'point-to-point',
      origin: points[12] as BackgammonPoint,
      destination: points[7] as BackgammonPoint,
      possibleMoves: [
        {
          dieValue: 5,
          direction: 'clockwise',
          origin: points[12] as BackgammonPoint,
          destination: points[7] as BackgammonPoint,
        },
      ],
    } as BackgammonMoveReady;

    const moves = new Set<BackgammonMoveReady>([move]) as any;

    return {
      id: 'play-1',
      stateKind: 'moving',
      player,
      board,
      moves,
    } as unknown as BackgammonPlayMoving;
  }

  it('selects the move suggested by the highest ranked hint', async () => {
    const play = createTestPlay();

    mockHints = [
      {
        rank: 1,
        difference: 0,
        equity: 0.42,
        evaluation: {
          win: 0.6,
          winGammon: 0.1,
          winBackgammon: 0.01,
          loseGammon: 0.05,
          loseBackgammon: 0.005,
          equity: 0.42,
          cubefulEquity: 0.42,
        },
        moves: [
          {
            from: 13,
            to: 8,
            moveKind: 'point-to-point',
            isHit: false,
            player: 'white',
            fromContainer: 'point',
            toContainer: 'point',
          },
        ],
      },
    ];

    const result = await selectBestMove(play, 'gbg-bot');
    expect(result?.id).toBe('move-1');
  });
});
