import type {
  BackgammonCheckerContainer,
  BackgammonColor,
  BackgammonGame,
  BackgammonMoveDirection,
  BackgammonPlayMoving,
} from '@nodots-llc/backgammon-types';
import type {
  GameHintContextOverrides,
  HintRequest,
} from '@nodots-llc/gnubg-hints';
import { createHintRequestFromGame } from '@nodots-llc/gnubg-hints';

export interface PlayHintContext {
  request: HintRequest;
}

export interface GameHintContext {
  request: HintRequest;
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
  const direction = play.player?.direction as BackgammonMoveDirection | undefined;
  if (!direction) {
    throw new Error('Unable to determine active player direction for GNU hints.');
  }

  const activeColor: BackgammonColor = play.player?.color ?? 'white';

  const request: HintRequest = {
    board: play.board,
    dice: deriveDiceFromPlay(play),
    activePlayerColor: activeColor,
    activePlayerDirection: direction,
    cubeValue: 1,
    cubeOwner: null,
    matchScore: [0, 0],
    matchLength: 0,
    crawford: false,
    jacoby: false,
    beavers: false,
  };

  return { request };
}

export function buildHintContextFromGame(
  game: BackgammonGame,
  overrides: GameHintContextOverrides = {},
): GameHintContext {
  const activePlayerColor: BackgammonColor =
    overrides.activePlayerColor ?? game.activePlayer?.color ?? 'white';
  const activePlayerDirection =
    overrides.activePlayerDirection ?? game.activePlayer?.direction;
  if (!activePlayerDirection) {
    throw new Error('Unable to determine active player direction for GNU hints.');
  }

  const request = createHintRequestFromGame(game, {
    ...overrides,
    activePlayerColor,
    activePlayerDirection,
  });

  return { request };
}

export function getNormalizedPosition(
  container: BackgammonCheckerContainer | undefined,
  direction: BackgammonMoveDirection,
): number | null {
  if (!container) {
    return null;
  }

  if (container.kind === 'bar' || container.kind === 'off') {
    return 0;
  }

  if (container.kind === 'point') {
    const position = container.position;
    if (position && typeof position === 'object') {
      const index = (position as unknown as Record<string, number>)[direction];
      if (typeof index === 'number') {
        return index;
      }
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
