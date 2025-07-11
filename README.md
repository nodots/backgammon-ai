# Nodots Backgammon AI

<!-- COVERAGE-START -->

![Statements](https://img.shields.io/badge/Statements-60%25-orange?style=flat-square)
![Branches](https://img.shields.io/badge/Branches-32%25-red?style=flat-square)
![Functions](https://img.shields.io/badge/Functions-50%25-red?style=flat-square)
![Lines](https://img.shields.io/badge/Lines-60%25-orange?style=flat-square)

<!-- COVERAGE-END -->

A TypeScript library that provides AI capabilities for backgammon games using GNU Backgammon (gnubg) as the backend engine. This package is part of the Nodots Backgammon ecosystem and **includes the complete gnubg source code** for self-contained deployment.

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

- **Self-Contained**: Complete gnubg source code included - no external dependencies
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
import { GnubgIntegration } from '@nodots-llc/backgammon-ai'

const gnubg = new GnubgIntegration()

// Example 1: Mid-game position (tested ✅)
const bestMove1 = await gnubg.getBestMove('gF/xATDgc/AAOA')
console.log('Best move:', bestMove1)

// Example 2: Running game position (tested ✅)
const bestMove2 = await gnubg.getBestMove('gJ/4AFjgc3AEO')
console.log('Best move:', bestMove2)
// Result: "24/20 16/13" (Equity: +0.466)
```

## GNU Backgammon (gnubg) Integration

This package includes the complete GNU Backgammon source code (version 1.08.003) in the `gnubg/` directory. You can build and install gnubg locally for optimal performance.

### Prerequisites for Building gnubg

To build gnubg from the included source code, you'll need:

**Required:**

- GLib >= 2.22
- C compiler (gcc or clang recommended)
- GNU make
- autoconf >= 2.60
- automake
- libtool
- pkg-config

**Optional (but recommended):**

- readline (for command line editing)
- sqlite3 (for database support)
- bison >= 2.4 (if modifying parser files)
- flex >= 2.5.9 (if modifying lexer files)

**Note:** GUI components (GTK+) and audio support are not required for AI integration.

### Quick Setup

```bash
# Automated setup with dependency checking
npm run setup-gnubg

# Manual build process
npm run gnubg:configure
npm run gnubg:build

# Verify installation
gnubg/gnubg --version
```

### Building gnubg

```bash
# Configure gnubg build (minimal configuration for AI use)
npm run gnubg:configure

# Build gnubg
npm run gnubg:build

# Install gnubg system-wide (optional)
npm run gnubg:install

# Clean gnubg build files
npm run gnubg:clean
```

### Manual Build (Advanced)

```bash
cd gnubg
./configure --enable-simd=yes --disable-gtk --disable-cputest --without-board3d --without-python
make
sudo make install  # Optional: install system-wide
```

For more build options, see:

```bash
cd gnubg && ./configure --help
```

## Plugin System & AI Analyzers

### 🔌 **Revolutionary Plugin Architecture**

Version 3.5.0 introduces a **groundbreaking plugin system** that transforms nodots-backgammon-ai into an **open, extensible platform** for backgammon AI development. The plugin system enables developers to create, share, and integrate diverse AI strategies seamlessly.

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

### Position Analysis with Plugin System

```typescript
import {
  GnubgIntegration,
  NodotsAIMoveAnalyzer,
  selectMoveFromList,
} from '@nodots-llc/backgammon-ai'

// Method 1: Direct GNU Backgammon integration
const gnubg = new GnubgIntegration()

if (await gnubg.isAvailable()) {
  const positionId = 'gJ/4AFjgc3AEO' // Tested position ID
  const bestMove = await gnubg.getBestMove(positionId)
  console.log('Best move:', bestMove) // "24/20 16/13"
} else {
  console.log(gnubg.getBuildInstructions())
}

// Method 2: Using the plugin system (recommended)
const nodotsAI = new NodotsAIMoveAnalyzer()
const intelligentMove = await selectMoveFromList(moves, nodotsAI)
console.log('Intelligent move:', intelligentMove)

// Method 3: Context-aware analysis
const contextualMove = await nodotsAI.selectMove(moves, {
  positionId: 'gJ/4AFjgc3AEO',
  board: currentBoardState,
})
```

### Legacy Integration Methods

```typescript
import { getGnubgMoveHint } from '@nodots-llc/backgammon-ai'

// Direct command execution (requires gnubg in PATH)
const bestMove = await getGnubgMoveHint('4HPwATDgc/ABMA')
```

### HTTP API Integration

```typescript
import { getBestMoveFromGnubg } from '@nodots-llc/backgammon-ai'

// Requires a gnubg HTTP server running on localhost:8000
const bestMove = await getBestMoveFromGnubg(positionId)
```

## GNU Backgammon Features

The included gnubg source provides world-class backgammon analysis:

- **World-class AI**: Rates over 2000 on FIBS (First Internet Backgammon Server)
- **Advanced Analysis**: Position evaluation, rollouts, match analysis
- **Professional Strength**: 2-ply cubeful analysis with world-class evaluation
- **Equity Calculations**: Detailed probability and equity analysis for each move
- **Move Rankings**: Complete analysis of all legal moves with equity differences
- **Database Support**: SQLite3, MySQL/MariaDB, PostgreSQL
- **Flexible Output**: Supports multiple export formats (SGF, HTML, PDF, PNG, etc.)
- **Scripting**: Python extension support
- **Internationalization**: 15+ languages supported

## Example Analysis Output

For position `gJ/4AFjgc3AEO`, gnubg provides detailed analysis:

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
git clone https://github.com/nodots/nodots-backgammon-ai.git
cd nodots-backgammon-ai
```

2. Install dependencies:

```bash
npm install
```

3. Build gnubg (recommended):

```bash
npm run setup-gnubg
```

4. Verify functionality:

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
- `npm run setup-gnubg` - Automated gnubg setup with dependency checking
- `npm run gnubg:configure` - Configure gnubg build
- `npm run gnubg:build` - Build gnubg from source
- `npm run gnubg:install` - Install gnubg system-wide
- `npm run gnubg:clean` - Clean gnubg build files

## Verified Compatibility

- ✅ **macOS 14.5.0** (Apple Silicon)
- ✅ **GNU Backgammon 1.08.003**
- ✅ **Node.js 18+**
- ✅ **TypeScript 5.7+**

## Troubleshooting

### Common Issues

1. **Build fails with GTK errors**: Use minimal configuration (already set in npm scripts)
2. **readline errors on macOS**: Fixed in v3.1.0 with compatibility patches
3. **gnubg not found**: Run `npm run setup-gnubg` for automated setup

### Getting Help

1. Check if gnubg builds: `npm run gnubg:configure && npm run gnubg:build`
2. Verify binary: `gnubg/gnubg --version`
3. Test integration: `npm test`

## License

This project is licensed under the MIT License.

**GNU Backgammon License**: The included gnubg source code is licensed under the GNU General Public License v3 or later. See `gnubg/COPYING` for details.

## Author

Ken Riley <kenr@nodots.com>

## Acknowledgments

- **GNU Backgammon Team**: For the excellent gnubg engine and analysis capabilities
- **GNU Project**: For maintaining and developing gnubg as free software
- **Backgammon Community**: For continued development and testing of gnubg
