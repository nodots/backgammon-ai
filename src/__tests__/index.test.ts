import type {
  BackgammonBoard,
  BackgammonMoveReady,
  BackgammonPlayMoving,
  BackgammonPoint,
  BackgammonPoints,
} from '@nodots/backgammon-types';

const { selectBestMove } = await import('../moveSelection.js')

describe('selectBestMove heuristic selection', () => {
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
      userId: 'test-robot',
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

    return {
      id: 'play-1',
      stateKind: 'moving',
      player,
      board,
      moves: [move],
    } as unknown as BackgammonPlayMoving;
  }

  it('selects a ready move via heuristics', async () => {
    const play = createTestPlay();
    const result = await selectBestMove(play);
    expect(result?.id).toBe('move-1');
    expect(result?.stateKind).toBe('ready');
  });

  it('returns undefined for empty moves array', async () => {
    const play = createTestPlay();
    (play as any).moves = [];
    const result = await selectBestMove(play);
    expect(result).toBeUndefined();
  });
});
