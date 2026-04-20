# Nodots Backgammon AI

**Version 1.0.0** | AI Engine powered by GNU Backgammon

<!-- COVERAGE-START -->
![Statements](https://img.shields.io/badge/Statements-60%25-orange?style=flat-square)
![Branches](https://img.shields.io/badge/Branches-32%25-red?style=flat-square)
![Functions](https://img.shields.io/badge/Functions-50%25-red?style=flat-square)
![Lines](https://img.shields.io/badge/Lines-60%25-orange?style=flat-square)
<!-- COVERAGE-END -->

A TypeScript library providing AI capabilities for backgammon games using the native `@nodots/gnubg-hints` addon to access GNU Backgammon's evaluation engine. Features a plugin system for custom AI analyzers and comprehensive move analysis.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Move Selection System](#move-selection-system)
- [Plugin System](#plugin-system)
- [GNU Backgammon Integration](#gnu-backgammon-integration)
- [Robot Execution](#robot-execution)
- [Testing](#testing)
- [License](#license)

---

## Features

- **GNU Backgammon Integration** - World-class AI via native addon (2000+ FIBS rating equivalent)
- **Plugin Architecture** - Extensible system for custom AI analyzers
- **Multiple Strategies** - From random testing to tournament-grade analysis
- **Structured Hints** - Equity calculations, move rankings, probability analysis
- **Robot Execution** - Complete turn automation with telemetry
- **TypeScript First** - Full type definitions and intelligent integration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        @nodots/backgammon-ai                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Move Selection Layer                              │  │
│  │                                                                       │  │
│  │  selectBestMove(play, robotId)                                       │  │
│  │         │                                                             │  │
│  │         ▼                                                             │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │  │
│  │  │   GNU       │──▶│  Opening    │──▶│  Strategic  │──▶ First Move   │  │
│  │  │   Hints     │   │   Book      │   │  Heuristics │                 │  │
│  │  └─────────────┘   └─────────────┘   └─────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Plugin System                                    │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Random    │  │  Furthest   │  │   Nodots    │  │    GNUBG    │  │  │
│  │  │  Analyzer   │  │  FromOff    │  │     AI      │  │  Analyzer   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │                                                                       │  │
│  │           MoveAnalyzer Interface + Plugin Loader                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   GNU Backgammon Integration                          │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │              @nodots/gnubg-hints (Native Addon)             │ │  │
│  │  │                                                                 │ │  │
│  │  │  getMoveHints()  │  getCubeHints()  │  getTakeHints()          │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │  Hint Context   │  │  GnubgHints     │  │  Position ID        │   │  │
│  │  │  Builder        │  │  Integration    │  │  Generator          │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Robot Execution Layer                              │  │
│  │                                                                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │  executeRobot   │  │    Telemetry    │  │    Board State      │   │  │
│  │  │  Turn           │  │    Tracking     │  │    Management       │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Dependencies                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │ @nodots/       │  │ @nodots/       │  │ @nodots/       │    │
│  │ backgammon-core    │  │ backgammon-types   │  │ gnubg-hints        │    │
│  │ (Logger, Board)    │  │ (Type definitions) │  │ (Native addon)     │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
src/
├── moveSelection.ts       # Main entry point for move selection
├── robotExecution.ts      # Robot turn execution with telemetry
├── gnubg.ts               # GnubgHintsIntegration class
├── hintContext.ts         # Board normalization for hints
├── moveAnalyzers.ts       # Built-in analyzer implementations
├── pluginLoader.ts        # Dynamic plugin loading
├── strategies/            # Move selection strategies
│   ├── openingBook.ts     # Predefined opening moves
│   └── heuristics.ts      # Strategic heuristics
└── __tests__/             # Test files
```

---

## Installation

```bash
npm install @nodots/backgammon-ai
```

### Requirements

- Node.js 18+
- Working `node-gyp` toolchain (Python 3, C/C++ compiler)
- Platform-specific build tools:
  - macOS: `xcode-select --install`
  - Debian/Ubuntu: `build-essential`

---

## Quick Start

### Get Move Hints

```typescript
import { buildHintContextFromGame, gnubgHints } from '@nodots/backgammon-ai'
import type { BackgammonGame } from '@nodots/backgammon-types'

const game: BackgammonGame = /* obtain current game state */
const { request } = buildHintContextFromGame(game)
const [bestHint] = await gnubgHints.getMoveHints(request)

console.log('Best move sequence:', bestHint?.moves)
console.log('Equity:', bestHint?.equity)
```

### Select Best Move

```typescript
import { selectBestMove } from '@nodots/backgammon-ai'
import type { BackgammonPlayMoving } from '@nodots/backgammon-types'

const bestMove = await selectBestMove(play as BackgammonPlayMoving, 'gbg-bot')
```

---

## Move Selection System

The move selection system uses a priority-based strategy cascade:

```
┌───────────────────────────────────────────────────┐
│            selectBestMove(play, robotId)          │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│  1. GNU Backgammon Structured Hints               │
│     (Required for gbg-bot, preferred for all)     │
│     - Equity-ranked move candidates               │
│     - Win/gammon/backgammon probabilities         │
└─────────────────────┬─────────────────────────────┘
                      │ fallback
                      ▼
┌───────────────────────────────────────────────────┐
│  2. Opening Book                                  │
│     - Predefined best moves for opening rolls     │
│     - Fast lookup, no computation                 │
└─────────────────────┬─────────────────────────────┘
                      │ fallback
                      ▼
┌───────────────────────────────────────────────────┐
│  3. Strategic Heuristics                          │
│     - Prefers advancing moves                     │
│     - Safety and offense evaluation               │
└─────────────────────┬─────────────────────────────┘
                      │ fallback
                      ▼
┌───────────────────────────────────────────────────┐
│  4. First Available Move                          │
│     - Ultimate fallback                           │
└───────────────────────────────────────────────────┘
```

---

## Plugin System

### Built-in Analyzers

| Analyzer | Strategy | Use Case |
|----------|----------|----------|
| `RandomMoveAnalyzer` | Random selection | Testing, baseline |
| `FurthestFromOffMoveAnalyzer` | Maximize distance | Defensive/blocking |
| `NodotsAIMoveAnalyzer` | Strategic heuristics | Intelligent gameplay |
| `GnubgMoveAnalyzer` | GNU Backgammon | World-class analysis |
| `ExamplePluginAnalyzer` | Template | Plugin development |

### Using Analyzers

```typescript
import {
  NodotsAIMoveAnalyzer,
  GnubgMoveAnalyzer,
  selectMoveFromList
} from '@nodots/backgammon-ai'

// Choose analyzer based on difficulty
const analyzer = difficulty === 'expert'
  ? new GnubgMoveAnalyzer()
  : new NodotsAIMoveAnalyzer()

const bestMove = await selectMoveFromList(moves, analyzer)
```

### Creating Custom Analyzers

```typescript
import { MoveAnalyzer, MoveAnalyzerContext } from '@nodots/backgammon-ai'
import { BackgammonMoveBase } from '@nodots/backgammon-types'

export class MyCustomAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
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

### Dynamic Plugin Loading

```typescript
import { loadAnalyzersFromPluginsDir } from '@nodots/backgammon-ai'

const analyzers = await loadAnalyzersFromPluginsDir('./my-plugins')
const move = await analyzers['myCustomAnalyzer'].selectMove(moves, context)
```

---

## GNU Backgammon Integration

### Hint Request Format

```typescript
interface HintRequest {
  positionId: string     // GNU Position ID
  roll: [number, number] // Dice values
}
```

### Getting Hints

```typescript
import { gnubgHints } from '@nodots/backgammon-ai'

// Move hints
const moveHints = await gnubgHints.getMoveHints(request, 5) // top 5 moves

// Cube hints
const cubeHints = await gnubgHints.getCubeHints(request)

// Take hints
const takeHints = await gnubgHints.getTakeHints(request)
```

### Hint Response

```typescript
interface MoveHint {
  moves: Array<{ from: number; to: number }>
  equity: number
  winProb: number
  gammonProb: number
  backgammonProb: number
}
```

### Configuration

```typescript
import { configureGnubgHints, initializeGnubgHints } from '@nodots/backgammon-ai'
import { MoveFilterSetting } from '@nodots/gnubg-hints'

// Initialize with custom weights
await initializeGnubgHints({ weightsPath: '/path/to/gnubg.weights' })

// Configure evaluation
configureGnubgHints({
  evalPlies: 2,
  moveFilter: MoveFilterSetting.Large
})
```

---

## Robot Execution

### Execute Robot Turn

```typescript
import { executeRobotTurn } from '@nodots/backgammon-ai'

const result = await executeRobotTurn(game, robotId)

if (result.success) {
  console.log('Robot completed turn')
  console.log('Updated game:', result.game)
  console.log('Telemetry:', result.telemetry)
}
```

### Telemetry Data

```typescript
interface AITelemetryStep {
  positionId: string
  roll: [number, number]
  rollSource: 'activePlayer.dice.currentRoll' | 'fallback'
  planLength: number
  planIndex: number
  planSource: 'gnubg' | 'heuristic' | 'fallback'
  hintCount: number
  mappedOriginId: string
  mappingStrategy: string
  mappingOutcome: 'success' | 'fallback' | 'override'
  singleDieRemaining: boolean
  override?: {
    reasonCode: string
    reasonText: string
  }
}
```

---

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint
npm run lint:fix
```

---

## Compatibility

- macOS 14+ (Apple Silicon)
- Linux (x64, arm64)
- Node.js 18+
- TypeScript 5.7+

---

## License

MIT License

Copyright (c) 2025 Ken Riley <kenr@nodots.com>

## Related Documentation

| Document | Description |
|----------|-------------|
| [Position ID Encoding](../../docs/POSITION_ID_ENCODING.md) | GNU Position ID format and encoding |
| [Type System Guide](../../docs/TYPE_SYSTEM_GUIDE.md) | Understanding game types and state |
| [Game State Diagram](../../docs/GAME_STATE_DIAGRAM.md) | Visual state machine diagrams |
| [Getting Started](../../docs/GETTING_STARTED.md) | Setup guide for the full ecosystem |
| [Contributing](../../CONTRIBUTING.md) | Development guidelines and PR process |

---

## Acknowledgments

- **GNU Backgammon Team** - For the excellent gnubg engine
- **GNU Project** - For maintaining gnubg as free software
