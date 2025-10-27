import type {
  DoubleHint,
  HintConfig,
  HintRequest,
  MoveHint,
  TakeHint,
} from '@nodots-llc/gnubg-hints';

type GnubgHintsModule = any;
type GnubgHintsHandle = any;

const buildInstructions = `
The @nodots-llc/gnubg-hints native addon could not be loaded.

Troubleshooting steps:
1. Ensure system build tools are installed (Node.js >= 18, Python 3, make, C/C++, and node-gyp prerequisites).
2. Reinstall dependencies from this package directory:
   npm install --build-from-source @nodots-llc/gnubg-hints
3. If you are inside a workspace, run:
   npm --prefix packages/ai install
4. Refer to the @nodots-llc/gnubg-hints README for platform-specific setup details.
`.trim();

let modulePromise: Promise<GnubgHintsModule> | null = null;

function loadAddon(): Promise<GnubgHintsModule> {
    if (!modulePromise) {
    modulePromise = import('@nodots-llc/gnubg-hints') as any;
    }
  return modulePromise!;
}

export class GnubgHintsIntegration {
  private initialized = false;
  private lastError: Error | null = null;

  private async getAddon(): Promise<GnubgHintsHandle> {
    try {
      const addon = await loadAddon();
      return addon.GnuBgHints;
    } catch (error) {
      const wrapped = new Error(
        `${buildInstructions}\n\nUnderlying error: ${String(error)}`
      );
      (wrapped as Error & { cause?: unknown }).cause = error;
      this.lastError = wrapped;
      modulePromise = null;
      throw wrapped;
    }
  }

  private async ensureInitialized(weightsPath?: string) {
    if (this.lastError) {
      throw this.lastError;
    }

    const addon = await this.getAddon();
    if (!this.initialized) {
      try {
        await addon.initialize(weightsPath);
        this.initialized = true;
      } catch (error) {
        const wrapped = new Error(
          `${buildInstructions}\n\nInitialization failed: ${String(error)}`
        );
        (wrapped as Error & { cause?: unknown }).cause = error;
        this.lastError = wrapped;
        this.initialized = false;
        throw wrapped;
      }
    }

    return addon;
  }

  async initialize(options?: { weightsPath?: string; config?: Partial<HintConfig> }) {
    const addon = await this.ensureInitialized(options?.weightsPath);
    if (options?.config) {
      addon.configure(options.config);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  getBuildInstructions(): string {
    return buildInstructions;
  }

  async configure(config: Partial<HintConfig>): Promise<void> {
    const addon = await this.ensureInitialized();
    addon.configure(config);
  }

  async getMoveHints(
    request: HintRequest,
    maxHints?: number
  ): Promise<MoveHint[]> {
    const addon = await this.ensureInitialized();
    return addon.getMoveHints(request, maxHints);
  }

  async getBestMove(
    request: HintRequest,
    maxHints = 1
  ): Promise<MoveHint | null> {
    const hints = await this.getMoveHints(request, maxHints);
    return hints.length > 0 ? hints[0] : null;
  }

  async getDoubleHint(request: HintRequest): Promise<DoubleHint> {
    const addon = await this.ensureInitialized();
    return addon.getDoubleHint(request);
  }

  async getTakeHint(request: HintRequest): Promise<TakeHint> {
    const addon = await this.ensureInitialized();
    return addon.getTakeHint(request);
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const addon = await this.getAddon();
      addon.shutdown();
    } finally {
      this.initialized = false;
      this.lastError = null;
    }
  }
}

export const gnubgHints = new GnubgHintsIntegration();
