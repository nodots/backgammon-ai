import type { BackgammonMoveBase } from '@nodots-llc/backgammon-types';
import type {
  DoubleHint,
  HintConfig,
  HintRequest,
  MoveHint,
  TakeHint,
} from '@nodots-llc/gnubg-hints';
import { MoveFilterSetting } from '@nodots-llc/gnubg-hints';
import { gnubgHints, GnubgHintsIntegration } from './gnubg.js';
import { MoveAnalyzer, RandomMoveAnalyzer } from './moveAnalyzers.js';

// Lazy registration to avoid circular dependency during module initialization
// The registration happens when registerAIProvider() is called, not at import time
let registered = false;

export async function registerAIProvider(): Promise<void> {
  if (registered) return;

  // Dynamic imports to break circular dependency (ESM-compatible)
  const { RobotAIRegistry } = await import('@nodots-llc/backgammon-core');
  const { GNUAIProvider } = await import('./GNUAIProvider.js');

  RobotAIRegistry.register(new GNUAIProvider());
  // Initialize and configure GNU hints once so execution and analysis share identical settings
  try {
    await initializeGnubgHints({
      config: DEFAULT_HINTS_CONFIG,
    });
  } catch (err) {
    // Non-fatal: consumers may initialize separately; log for visibility
    console.warn('[AI] gnubg-hints init/config skipped:', String(err));
  }
  registered = true;
}

export type { DoubleHint, HintConfig, HintRequest, MoveHint, TakeHint };
export { gnubgHints, GnubgHintsIntegration };
// Default shared configuration used by robots and PR analysis
export const DEFAULT_HINTS_CONFIG: Partial<HintConfig> = {
  evalPlies: 2,
  moveFilter: MoveFilterSetting.Large,
  usePruning: true,
};

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
// Training modules are not part of the current distribution
// export * from './training/features.js';
// export * from './training/dataset.js';
// export * from './training/policyModel.js';

// Export AI provider implementations
export { GNUAIProvider } from './GNUAIProvider.js';
export { executeRobotTurnWithGNU } from './robotExecution.js';

// Export luck analysis
export * from './luckCalculator.js';
