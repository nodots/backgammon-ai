import type { BackgammonMoveBase } from '@nodots-llc/backgammon-types';
import type {
  DoubleHint,
  HintConfig,
  HintRequest,
  MoveHint,
  TakeHint,
} from '@nodots-llc/gnubg-hints';
import { gnubgHints, GnubgHintsIntegration } from './gnubg.js';
import { MoveAnalyzer, RandomMoveAnalyzer } from './moveAnalyzers.js';

export type { DoubleHint, HintConfig, HintRequest, MoveHint, TakeHint };
export { gnubgHints, GnubgHintsIntegration };

export async function initializeGnubgHints(options?: {
  weightsPath?: string;
  config?: Partial<HintConfig>;
}): Promise<void> {
  await gnubgHints.initialize(options);
}

export async function configureGnubgHints(
  config: Partial<HintConfig>
): Promise<void> {
  await gnubgHints.configure(config);
}

export async function getMoveHints(
  request: HintRequest,
  maxHints?: number
): Promise<MoveHint[]> {
  return gnubgHints.getMoveHints(request, maxHints);
}

export async function getBestMove(
  request: HintRequest,
  options?: { maxHints?: number }
): Promise<MoveHint | null> {
  return gnubgHints.getBestMove(request, options?.maxHints);
}

export async function getDoubleHint(request: HintRequest): Promise<DoubleHint> {
  return gnubgHints.getDoubleHint(request);
}

export async function getTakeHint(request: HintRequest): Promise<TakeHint> {
  return gnubgHints.getTakeHint(request);
}

export async function shutdownGnubgHints(): Promise<void> {
  await gnubgHints.shutdown();
}

export async function selectMoveFromList(
  moves: BackgammonMoveBase[],
  analyzer?: MoveAnalyzer
): Promise<BackgammonMoveBase | null> {
  const moveAnalyzer = analyzer ?? new RandomMoveAnalyzer();
  return moveAnalyzer.selectMove(moves);
}

export * from './moveAnalyzers.js';
export * from './moveSelection.js';
export * from './pluginLoader.js';
export * from './hintContext.js';
export * from './training/features.js';
export * from './training/dataset.js';
export * from './training/policyModel.js';
