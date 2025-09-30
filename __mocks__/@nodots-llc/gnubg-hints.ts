import type {
  BackgammonBoard,
  BackgammonColor,
  BackgammonGame,
} from '@nodots-llc/backgammon-types';

export type HintBoard = BackgammonBoard | SimplifiedBoard;

interface SimplifiedCheckerContainer {
  id?: string;
  position?: Record<string, number> | string;
  checkers?: Array<{ color?: BackgammonColor }>;
}

interface SimplifiedBoard {
  id?: string;
  points?: SimplifiedCheckerContainer[];
  bar?: Record<string, SimplifiedCheckerContainer>;
  off?: Record<string, SimplifiedCheckerContainer>;
}

export interface HintRequest {
  board: HintBoard;
  dice: [number, number];
  cubeValue: number;
  cubeOwner: BackgammonColor | null;
  matchScore: [number, number];
  matchLength: number;
  crawford: boolean;
  jacoby: boolean;
  beavers: boolean;
}

export interface Evaluation {
  win: number;
  winGammon: number;
  winBackgammon: number;
  loseGammon: number;
  loseBackgammon: number;
  equity: number;
  cubefulEquity?: number;
}

export interface MoveStep {
  from: number;
  to: number;
  moveKind: 'point-to-point' | 'reenter' | 'bear-off';
  isHit: boolean;
  player: BackgammonColor;
  fromContainer: 'bar' | 'point' | 'off';
  toContainer: 'bar' | 'point' | 'off';
}

export interface MoveHint {
  moves: MoveStep[];
  evaluation: Evaluation;
  equity: number;
  rank: number;
  difference: number;
}

export interface DoubleHint {
  action: 'double' | 'no-double' | 'too-good' | 'beaver' | 'redouble';
  takePoint: number;
  dropPoint: number;
  evaluation: Evaluation;
  cubefulEquity: number;
}

export interface TakeHint {
  action: 'take' | 'drop' | 'beaver';
  evaluation: Evaluation;
  takeEquity: number;
  dropEquity: number;
}

export interface GameHintContextOverrides {
  board?: HintBoard;
  dice?: [number, number];
  defaultDice?: [number, number];
  cubeValue?: number;
  cubeOwner?: BackgammonColor | null;
  matchScore?: [number, number];
  matchLength?: number;
  crawford?: boolean;
  jacoby?: boolean;
  beavers?: boolean;
}

const defaultEvaluation: Evaluation = {
  win: 0,
  winGammon: 0,
  winBackgammon: 0,
  loseGammon: 0,
  loseBackgammon: 0,
  equity: 0,
};

let mockHints: MoveHint[] = [];
let available = true;

export class GnuBgHints {
  static async initialize(): Promise<void> {
    available = true;
  }

  static configure(): void {
    // noop in mock
  }

  static async getMoveHints(
    _request: HintRequest,
    maxHints = mockHints.length,
  ): Promise<MoveHint[]> {
    if (!available) {
      throw new Error('Mock addon unavailable');
    }
    return mockHints.slice(0, maxHints);
  }

  static async getDoubleHint(_request: HintRequest): Promise<DoubleHint> {
    return {
      action: 'no-double',
      takePoint: 0,
      dropPoint: 0,
      evaluation: defaultEvaluation,
      cubefulEquity: 0,
    };
  }

  static async getTakeHint(_request: HintRequest): Promise<TakeHint> {
    return {
      action: 'take',
      evaluation: defaultEvaluation,
      takeEquity: 0,
      dropEquity: 0,
    };
  }

  static shutdown(): void {
    mockHints = [];
    available = true;
  }

  static __setHints(hints: MoveHint[]): void {
    mockHints = hints;
  }

  static __setAvailable(value: boolean): void {
    available = value;
  }
}

export function createHintRequestFromGame(
  game: BackgammonGame,
  overrides: GameHintContextOverrides = {},
): HintRequest {
  const dice = overrides.dice ?? overrides.defaultDice ?? [0, 0];
  return {
    board: overrides.board ?? game.board,
    dice,
    cubeValue: overrides.cubeValue ?? game.cube?.value ?? 1,
    cubeOwner: overrides.cubeOwner ?? game.cube?.owner?.color ?? null,
    matchScore: overrides.matchScore ?? [0, 0],
    matchLength:
      overrides.matchLength ??
      (game as any)?.metadata?.matchLength ??
      (game as any)?.matchInfo?.matchLength ??
      0,
    crawford: overrides.crawford ?? false,
    jacoby: overrides.jacoby ?? Boolean(game.rules?.useJacobyRule),
    beavers: overrides.beavers ?? Boolean(game.rules?.useBeaverRule),
  };
}

export function __setMockHints(hints: MoveHint[]): void {
  mockHints = hints;
}

export function __setMockAvailability(value: boolean): void {
  available = value;
}
