# Nodots Backgammon AI

Current version: 4.1.1.

<!-- COVERAGE-START -->

![Statements](https://img.shields.io/badge/Statements-60%25-orange?style=flat-square)
![Branches](https://img.shields.io/badge/Branches-32%25-red?style=flat-square)
![Functions](https://img.shields.io/badge/Functions-50%25-red?style=flat-square)
![Lines](https://img.shields.io/badge/Lines-60%25-orange?style=flat-square)

<!-- COVERAGE-END -->

A TypeScript library that provides AI capabilities for backgammon games using the native `@nodots-llc/gnubg-hints` addon to access GNU Backgammon's evaluation engine. This package is part of the Nodots Backgammon ecosystem and focuses on structured hints rather than spawning external binaries.

## 🎯 What's New in v3.5.0

- 🔌 **Revolutionary Plugin System** - Open, extensible architecture for AI development
- 🧠 **Nodots AI Engine** - New intelligent analyzer with strategic heuristics
- 🌐 **Five Built-in Analyzers** - From random to world-class GNU Backgammon AI
- 🚀 **Dynamic Plugin Loading** - Hot-swappable AI engines with automatic discovery
- 💡 **Context-Aware Analysis** - Analyzers receive board state and position data
- 🔓 **Open Development Platform** - Community-driven, plugin-friendly architecture
- 📊 **Enhanced API Surface** - New exports for plugin development and integration
- 🎯 **Template-Based Development** - Easy plugin creation with standardized interfaces

## Features

### 🔌 **Plugin System & Openness**

- **Open Architecture**: Plugin system enables community-contributed analyzers
- **Five Built-in Analyzers**: Random, strategic, defensive, template, and world-class AI
- **Hot-Swappable Intelligence**: Switch between AI engines seamlessly
- **Context-Aware Analysis**: Analyzers receive board state and position information
- **Dynamic Loading**: Automatic discovery and loading of custom plugins
- **Template-Based Development**: Standardized interfaces for easy plugin creation

### 🧠 **AI Intelligence Options**

- **Nodots AI Engine**: Strategic heuristics with safety, offense, and racing priorities
- **GNU Backgammon Integration**: World-class AI with 2000+ FIBS rating equivalent
- **Multiple Strategies**: From random testing to tournament-grade analysis
- **Extensible Framework**: Build custom analyzers for specialized strategies

### 🚀 **Production Ready**

- **Native Hints**: Powered by the `@nodots-llc/gnubg-hints` addon – no external binaries to ship or manage
- **TypeScript First**: Full type definitions and intelligent integration
- **Cross-Platform**: Supports macOS, Linux with automated build scripts
- **Comprehensive Analysis**: Equity calculations, move rankings, and probability analysis
- **Minimal Dependencies**: CLI-only build without GUI components

## Installation

```bash
npm install @nodots-llc/backgammon-ai
```

## Quick Start - Verified Examples

Here are **tested position IDs** that work with the integrated gnubg engine:

```typescript
import { buildHintContextFromGame, gnubgHints } from '@nodots-llc/backgammon-ai'
import type { BackgammonGame } from '@nodots-llc/backgammon-types'

const game: BackgammonGame = /* obtain current game state */
const { request } = buildHintContextFromGame(game)
const [bestHint] = await gnubgHints.getMoveHints(request)

console.log('Top-ranked move sequence:', bestHint?.moves)
console.log('Equity:', bestHint?.equity)
```

## GNU Backgammon Hints Integration

As of v4.1, this package relies on the `@nodots-llc/gnubg-hints` native addon instead of bundling the entire GNU Backgammon source tree. The addon wraps GNU Backgammon's evaluation engine through N-API and ships with TypeScript definitions.

### Requirements

- Node.js 18+
- A working [node-gyp](https://github.com/nodejs/node-gyp) toolchain (Python 3, make, and a C/C++ compiler)
- Platform-specific build tools (e.g., `xcode-select --install` on macOS, `build-essential` on Debian/Ubuntu)

### Installation

```bash
npm install @nodots-llc/backgammon-ai
```

The native addon is compiled during installation; no additional scripts are required.

### Advanced configuration

```typescript
import {
  configureGnubgHints,
  initializeGnubgHints,
} from '@nodots-llc/backgammon-ai'

await initializeGnubgHints({ weightsPath: '/path/to/gnubg.weights' })
configureGnubgHints({ evalPlies: 2, moveFilter: 3 })
```

- `weightsPath` lets you supply custom neural-network weights.
- `configureGnubgHints` mirrors the tuning options provided by the addon (plies, move filters, pruning, etc.).

### Troubleshooting

- Review `gnubgHints.getBuildInstructions()` for platform-specific guidance.
- Rebuild manually with `npx node-gyp rebuild --ansi`.
- Consult the [`@nodots-llc/gnubg-hints` README](https://www.npmjs.com/package/@nodots-llc/gnubg-hints) for detailed setup notes.

## Plugin System & AI Analyzers

### 🔌 **Revolutionary Plugin Architecture**

Version 3.5.0 introduces a **groundbreaking plugin system** that transforms ai into an **open, extensible platform** for backgammon AI development. The plugin system enables developers to create, share, and integrate diverse AI strategies seamlessly.

### **Built-in Analyzers**

| Analyzer                        | Strategy                           | Use Case                                        |
| ------------------------------- | ---------------------------------- | ----------------------------------------------- |
| **RandomMoveAnalyzer**          | Random selection                   | Testing, baseline comparison                    |
| **FurthestFromOffMoveAnalyzer** | Maximize distance from bearing off | Defensive/blocking strategies                   |
| **ExamplePluginAnalyzer**       | Template for developers            | Plugin development starting point               |
| **GnubgMoveAnalyzer**           | GNU Backgammon integration         | World-class AI analysis                         |
| **NodotsAIMoveAnalyzer**        | Strategic heuristics engine        | Intelligent gameplay with safety/offense/racing |

### **Using Different Analyzers**

```typescript
import {
  NodotsAIMoveAnalyzer,
  GnubgMoveAnalyzer,
  RandomMoveAnalyzer,
  selectMoveFromList,
} from '@nodots-llc/backgammon-ai'

// Choose analyzer based on game context
const analyzer =
  difficulty === 'expert' ? new GnubgMoveAnalyzer() : new NodotsAIMoveAnalyzer()

const bestMove = await selectMoveFromList(moves, analyzer)
```

### **Creating Custom Analyzers**

```typescript
import { MoveAnalyzer, MoveAnalyzerContext } from '@nodots-llc/backgammon-ai'
import { BackgammonMoveBase } from '@nodots-llc/backgammon-types'

export class MyCustomAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    // Your custom AI logic here
    // Access board state: context?.board
    // Access position ID: context?.positionId

    // Example: Prefer moves with higher die values
    return moves.reduce((best, current) =>
      current.dieValue > best.dieValue ? current : best
    )
  }
}

export default MyCustomAnalyzer
```

### **Dynamic Plugin Loading**

```typescript
import { loadAnalyzersFromPluginsDir } from '@nodots-llc/backgammon-ai'

// Load all analyzers from a directory
const analyzers = loadAnalyzersFromPluginsDir('./my-plugins')

// Use any loaded analyzer
const move = await analyzers['myCustomAnalyzer'].selectMove(moves, {
  positionId: 'gJ/4AFjgc3AEO',
  board: currentBoard,
})
```

### **Nodots AI Engine - Strategic Heuristics**

The new **NodotsAIMoveAnalyzer** implements intelligent move selection with a three-tier strategy system:

```typescript
import { NodotsAIMoveAnalyzer } from '@nodots-llc/backgammon-ai'

const nodotsAI = new NodotsAIMoveAnalyzer()

// The AI prioritizes:
// 1. Safety: Creating points, escaping blots
// 2. Offense: Attacking opponent blots, blocking
// 3. Racing: Advancing checkers efficiently

const bestMove = await nodotsAI.selectMove(moves, context)
```

### **Plugin Development Template**

1. **Create your analyzer class:**

```typescript
// plugins/myAnalyzer.ts
import { MoveAnalyzer, MoveAnalyzerContext } from '@nodots-llc/backgammon-ai'

export class MyAnalyzer implements MoveAnalyzer {
  async selectMove(moves, context) {
    // Your logic here
    return moves[0] || null
  }
}

export default MyAnalyzer
```

2. **Load and use it:**

```typescript
import { loadAnalyzersFromPluginsDir } from '@nodots-llc/backgammon-ai'
const analyzers = loadAnalyzersFromPluginsDir('./plugins')
const move = await analyzers['myAnalyzer'].selectMove(moves, context)
```

### **Community & Openness**

The plugin system embodies our commitment to **open development**:

- 🔓 **Open Architecture**: No vendor lock-in, switch AI engines seamlessly
- 🌐 **Community-Driven**: Easy contribution of new analyzers
- 🧪 **Experimentation-Friendly**: Test strategies without code changes
- 📚 **Template-Based**: Standardized interfaces for easy development
- 🚀 **Innovation Platform**: Framework for AI research and development

---

## Usage

### Retrieving structured hints

```typescript
import {
  buildHintContextFromGame,
  gnubgHints,
} from '@nodots-llc/backgammon-ai'

const { request } = buildHintContextFromGame(gameState)
const [topHint] = await gnubgHints.getMoveHints(request, 5)

console.log('Top candidate moves:', topHint?.moves)
console.log('Equity:', topHint?.equity)
```

### Selecting moves via analyzers

```typescript
import { selectBestMove } from '@nodots-llc/backgammon-ai'
import type { BackgammonPlayMoving } from '@nodots-llc/backgammon-types'

const bestMove = await selectBestMove(play as BackgammonPlayMoving, 'gbg-bot')
```
1. 24/20 16/13    Eq: +0.466 ⭐ BEST MOVE
   Win: 59.5%, Gammon: 22.5%, Backgammon: 2.4%

2. 24/21 24/20    Eq: +0.434 (-0.032)
   Win: 58.7%, Gammon: 22.8%, Backgammon: 2.5%

3. 24/20 13/10    Eq: +0.414 (-0.052)
   Win: 58.2%, Gammon: 22.9%, Backgammon: 2.9%
```

## Development

### Setup

1. Clone the repository:

```bash
git clone https://github.com/nodots/ai.git
cd ai
```

2. Install dependencies:

```bash
npm install
```

3. Verify functionality:

```bash
npm test
npm run build
```

### Available Scripts

- `npm run build` - Build the TypeScript project
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run clean` - Clean build artifacts

## Verified Compatibility

- ✅ **macOS 14.5.0** (Apple Silicon)
- ✅ **GNU Backgammon 1.08.003**
- ✅ **Node.js 18+**
- ✅ **TypeScript 5.7+**

## Troubleshooting

### Common Issues

1. **Build fails with GTK errors**: Use minimal configuration (already set in npm scripts)
2. **readline errors on macOS**: Fixed in v3.1.0 with compatibility patches
3. **Native build fails**: Ensure a working node-gyp toolchain (`python3`, `make`, and a C/C++ compiler)

### Getting Help

3. Test integration: `npm test`

## License

This project is licensed under the MIT License.

## Author

Ken Riley <kenr@nodots.com>

## Acknowledgments

- **GNU Backgammon Team**: For the excellent gnubg engine and analysis capabilities
- **GNU Project**: For maintaining and developing gnubg as free software
- **Backgammon Community**: For continued development and testing of gnubg

> Minor README refresh.

## Package split
- New MIT core: @nodots-llc/backgammon-ai-core
- Optional GNU adapter (GPL): @nodots-llc/backgammon-ai-gnubg

Migration:
- Install ai-core and (optionally) ai-gnubg & gnubg-hints
