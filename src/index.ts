import type { BackgammonMoveBase } from '@nodots/backgammon-types';
import type {
  DoubleHint,
  HintConfig,
  HintRequest,
  MoveHint,
  TakeHint,
} from '@nodots/gnubg-hints';
import { MoveFilterSetting } from '@nodots/gnubg-hints';
import { gnubgHints, GnubgHintsIntegration } from './gnubg.js';
import { MoveAnalyzer, RandomMoveAnalyzer } from './moveAnalyzers.js';

// Lazy registration to avoid circular dependency during module initialization
// The registration happens when registerAIProvider() is called, not at import time
let registered = false;

export async function registerAIProvider(): Promise<void> {
  if (registered) return;

  const { RobotAIRegistry } = await import('@nodots/backgammon-core');
  const { GNUAIProvider } = await import('./GNUAIProvider.js');
  const { NodotsAIProvider } = await import('./NodotsAIProvider.js');
  const { TeaLeavesAIProvider } = await import('./TeaLeavesAIProvider.js');

  const gnuProvider = new GNUAIProvider();
  const nodotsProvider = new NodotsAIProvider();
  const teaLeavesProvider = new TeaLeavesAIProvider();

  // GNU robots: matched by email prefix from seed-robots.ts
  RobotAIRegistry.register('gnu-*', gnuProvider);
  RobotAIRegistry.register('gbg-bot@nodots.com', gnuProvider);
  // Nodots heuristic bot
  RobotAIRegistry.register('nbg-*', nodotsProvider);
  // Tea Leaves: calibration-floor provider that picks by hashing position id
  RobotAIRegistry.register('tea-*', teaLeavesProvider);
  // Fallback for any unrecognized robot
  RobotAIRegistry.register('*', nodotsProvider);

  // Initialize GNU hints engine
  try {
    await initializeGnubgHints({
      config: DEFAULT_HINTS_CONFIG,
    });
  } catch (err) {
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
export { NodotsAIProvider } from './NodotsAIProvider.js';
export { executeRobotTurnWithGNU } from './robotExecution.js';

// Export luck analysis
export * from './luckCalculator.js';
