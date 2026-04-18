import type {
  BackgammonBoard,
  BackgammonChecker,
  BackgammonCheckerContainer,
  BackgammonColor,
  BackgammonGame,
  BackgammonPlayMoving,
  BackgammonPoints,
} from '@nodots/backgammon-types';
import type {
  GameHintContextOverrides,
  HintRequest,
} from '@nodots/gnubg-hints';
import { createHintRequestFromGame } from '@nodots/gnubg-hints';

export type GnubgColor = Exclude<BackgammonColor, undefined>;

export interface GnubgColorNormalization {
  toGnu: Record<GnubgColor, GnubgColor>;
  fromGnu: Record<GnubgColor, GnubgColor>;
}

export interface PlayHintContext {
  request: HintRequest;
  normalization: GnubgColorNormalization;
}

export interface GameHintContext {
  request: HintRequest;
  normalization: GnubgColorNormalization;
}

function createColorNormalization(
  clockwiseColor: GnubgColor,
  counterClockwiseColor: GnubgColor,
): GnubgColorNormalization {
  return {
    toGnu: {
      [clockwiseColor]: 'white',
      [counterClockwiseColor]: 'black',
    } as Record<GnubgColor, GnubgColor>,
    fromGnu: {
      white: clockwiseColor,
      black: counterClockwiseColor,
    },
  };
}

function normalizeChecker(
  checker: BackgammonChecker,
  colorMap: Record<GnubgColor, GnubgColor>,
): BackgammonChecker {
  const mappedColor = colorMap[checker.color] ?? checker.color;
  if (mappedColor === checker.color) {
    return checker;
  }

  return {
    ...checker,
    color: mappedColor,
  };
}

function normalizeCheckerArray(
  checkers: BackgammonChecker[] | undefined,
  colorMap: Record<GnubgColor, GnubgColor>,
): BackgammonChecker[] {
  if (!Array.isArray(checkers)) {
    return [];
  }
  return checkers.map((checker) => normalizeChecker(checker, colorMap));
}

export function normalizeBoardForHints(
  board: BackgammonBoard,
  colorMap: Record<GnubgColor, GnubgColor>,
): BackgammonBoard {
  return {
    id: board.id,
    points: board.points.map((point) => ({
      id: point.id,
      kind: 'point',
      position: { ...point.position },
      checkers: normalizeCheckerArray(point.checkers, colorMap),
    })) as BackgammonPoints,
    bar: {
      clockwise: {
        ...board.bar.clockwise,
        checkers: normalizeCheckerArray(
          board.bar.clockwise?.checkers,
          colorMap,
        ),
      },
      counterclockwise: {
        ...board.bar.counterclockwise,
        checkers: normalizeCheckerArray(
          board.bar.counterclockwise?.checkers,
          colorMap,
        ),
      },
    },
    off: {
      clockwise: {
        ...board.off.clockwise,
        checkers: normalizeCheckerArray(
          board.off.clockwise?.checkers,
          colorMap,
        ),
      },
      counterclockwise: {
        ...board.off.counterclockwise,
        checkers: normalizeCheckerArray(
          board.off.counterclockwise?.checkers,
          colorMap,
        ),
      },
    },
  }
}

function deriveNormalizationFromGame(game: BackgammonGame): GnubgColorNormalization {
  const clockwisePlayer = game.players.find(
    (player) => player.direction === 'clockwise',
  );
  const counterPlayer = game.players.find(
    (player) => player.direction === 'counterclockwise',
  );

  if (!clockwisePlayer || !counterPlayer) {
    throw new Error('Unable to determine player directions for GNU BG normalization.');
  }

  return createColorNormalization(clockwisePlayer.color, counterPlayer.color);
}

function deriveNormalizationFromPlay(play: BackgammonPlayMoving): GnubgColorNormalization {
  const activeColor = play.player.color;
  const opponentColor: GnubgColor = activeColor === 'white' ? 'black' : 'white';

  if (play.player.direction === 'clockwise') {
    return createColorNormalization(activeColor, opponentColor);
  }

  return createColorNormalization(opponentColor, activeColor);
}

function normalizeMatchScore(
  game: BackgammonGame,
  colorMap: Record<GnubgColor, GnubgColor>,
): [number, number] {
  const rawScore =
    (game as any)?.matchScore ??
    (game as any)?.metadata?.matchScore ??
    (game as any)?.metadata?.matchInfo?.matchScore ??
    (game as any)?.matchInfo?.matchScore

  const whiteScore = rawScore?.white ?? 0
  const blackScore = rawScore?.black ?? 0

  const mapped: [number, number] = [0, 0]

  const assign = (actualColor: GnubgColor, value: number) => {
    const gnuColor = colorMap[actualColor] ?? actualColor
    if (gnuColor === 'white') {
      mapped[0] = value
    } else {
      mapped[1] = value
    }
  }

  assign('white', whiteScore)
  assign('black', blackScore)

  return mapped
}

function normalizeCubeOwner(
  owner: BackgammonColor | undefined,
  colorMap: Record<GnubgColor, GnubgColor>,
): GnubgColor | null {
  if (!owner) {
    return null;
  }
  return colorMap[owner] ?? owner;
}

function deriveDiceFromPlay(play: BackgammonPlayMoving): [number, number] {
  const currentRoll = play.player.dice?.currentRoll;
  if (Array.isArray(currentRoll) && currentRoll.length === 2) {
    return [currentRoll[0] ?? 0, currentRoll[1] ?? 0];
  }
  return [0, 0];
}

export function buildHintContextFromPlay(
  play: BackgammonPlayMoving,
): PlayHintContext {
  const normalization = deriveNormalizationFromPlay(play);
  const board = normalizeBoardForHints(play.board, normalization.toGnu);

  const request: HintRequest = {
    board,
    dice: deriveDiceFromPlay(play),
    activePlayerDirection: play.player.direction,
    cubeValue: 1,
    cubeOwner: null,
    matchScore: [0, 0],
    matchLength: 0,
    crawford: false,
    jacoby: false,
    beavers: false,
  };

  return { request, normalization };
}

export function buildHintContextFromGame(
  game: BackgammonGame,
  overrides: GameHintContextOverrides = {},
): GameHintContext {
  const normalization = deriveNormalizationFromGame(game);
  const normalizedBoard = normalizeBoardForHints(game.board, normalization.toGnu);

  // Normalize activePlayerColor through the same color map used for the board.
  // Without this, a game where clockwise=BLACK passes 'black' as the active
  // color even though the board has been remapped so clockwise checkers are
  // 'white'. This causes convertBoardToGnuBg to select the wrong player's
  // checkers via rollIsWhite.
  const normalizedActivePlayerColor = overrides.activePlayerColor
    ? normalization.toGnu[overrides.activePlayerColor]
    : undefined;

  const request = createHintRequestFromGame(game, {
    ...overrides,
    board: normalizedBoard,
    activePlayerColor: normalizedActivePlayerColor,
    cubeOwner:
      overrides.cubeOwner ??
      normalizeCubeOwner(game.cube?.owner?.color, normalization.toGnu),
    matchScore:
      overrides.matchScore ?? normalizeMatchScore(game, normalization.toGnu),
  });

  return { request, normalization };
}

export function getNormalizedPosition(
  container: BackgammonCheckerContainer | undefined,
  normalizedColor: GnubgColor,
): number | null {
  if (!container) {
    return null;
  }

  if (container.kind === 'bar' || container.kind === 'off') {
    return 0;
  }

  if (container.kind === 'point') {
    const position = container.position;
    if (typeof position === 'object' && position !== null) {
      const value =
        normalizedColor === 'white'
          ? (position as { clockwise?: number }).clockwise
          : (position as { counterclockwise?: number }).counterclockwise
      return typeof value === 'number' ? value : null;
    }
  }

  return null;
}

export function getContainerKind(
  container: BackgammonCheckerContainer | undefined,
): 'point' | 'bar' | 'off' {
  if (!container) {
    return 'point';
  }
  if (container.kind === 'bar') {
    return 'bar';
  }
  if (container.kind === 'off') {
    return 'off';
  }
  return 'point';
}
