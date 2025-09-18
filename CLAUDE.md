# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the AI package (`@nodots-llc/backgammon-ai`) within the Nodots Backgammon monorepo ecosystem. It provides AI capabilities for backgammon games using GNU Backgammon (gnubg) as the backend engine and includes a plugin system for custom AI analyzers.

## Repository Structure

This package is part of a monorepo located at `/Users/kenr/Code/nodots-backgammon/`. Other packages in the ecosystem include:
- `core` - Core game logic
- `types` - Shared TypeScript types
- `api` - API server
- `client` - Frontend application
- `api-utils` - Shared API utilities

## Common Development Commands

### Build and Testing
```bash
npm run build          # Build TypeScript (also copies gnubg binaries)
npm test               # Run Jest tests
npm test:watch         # Run tests in watch mode
npm test:coverage      # Run tests with coverage report
```

### Linting
```bash
npm run lint          # Run ESLint on src/**/*.ts
npm run lint:fix      # Auto-fix ESLint issues
```

### GNU Backgammon Setup
```bash
npm run setup-gnubg    # Automated setup with dependency checking
npm run gnubg:configure # Configure gnubg build (minimal configuration)
npm run gnubg:build    # Build gnubg from source
npm run gnubg:install  # Install gnubg system-wide (optional)
npm run gnubg:clean    # Clean gnubg build files
```

### Cleanup
```bash
npm run clean         # Remove dist and coverage directories
```

## Architecture

### Core Components

1. **Move Selection System** (`src/moveSelection.ts`)
   - Main entry point for AI move selection
   - Integrates multiple strategies: GNU Backgammon, opening book, strategic heuristics
   - Special handling for `gbg-bot` which requires GNU Backgammon

2. **Plugin System** (`src/moveAnalyzers.ts`, `src/pluginLoader.ts`)
   - Extensible analyzer interface (`MoveAnalyzer`)
   - Built-in analyzers: Random, FurthestFromOff, Example template
   - Dynamic plugin loading from directories
   - Context-aware analysis with board state and position ID

3. **GNU Backgammon Integration** (`src/gnubg.ts`, `src/gnubgApi.ts`)
   - `GnubgIntegration` class manages gnubg binary detection and execution
   - Supports local builds, bundled binaries, and system installations
   - Position analysis and best move extraction
   - HTTP API integration for remote gnubg servers

4. **WebSocket Service** (`src/websocket/`)
   - `AIWebSocketClient` - Client for real-time game connections

### Key Dependencies

- **Types**: All game types imported from `@nodots-llc/backgammon-types`
- **Core**: Logger imported from `@nodots-llc/backgammon-core`
- **External**: socket.io-client for WebSocket, axios for HTTP

### Type System

- Uses ES modules (`"type": "module"` in package.json)
- Strict TypeScript configuration with type declarations
- Relative imports for local types (e.g., `../../types/src/move`)
- No circular dependencies enforced by ESLint rules

## Important Patterns

### Move Selection Flow
1. `selectBestMove()` receives a `BackgammonPlayMoving` object
2. Filters moves for those with `stateKind: 'ready'`
3. Attempts strategies in order:
   - GNU Backgammon (required for gbg-bot)
   - Opening book (predefined best moves for opening rolls)
   - Strategic heuristics (prefers advancing moves)
   - Fallback to first available move

### Plugin Development
```typescript
export class MyAnalyzer implements MoveAnalyzer {
  async selectMove(
    moves: BackgammonMoveBase[],
    context?: MoveAnalyzerContext
  ): Promise<BackgammonMoveBase | null> {
    // Custom logic here
    return moves[0] || null
  }
}
```

### GNU Backgammon Position IDs
- Position IDs are base64-encoded board states
- Tested examples: `'gF/xATDgc/AAOA'`, `'gJ/4AFjgc3AEO'`
- Used for position analysis and move generation

## Known Issues and Considerations

1. **gbg-bot Integration**: Currently throws error as GNU BG integration is incomplete - needs position ID generation from game state

2. **Import Paths**: Uses relative imports for types package (`../../types/src/`) which may need adjustment if package structure changes

3. **GNU Backgammon Binary**: Requires local build or system installation - automated setup script available

4. **ES Module Compatibility**: Some plugins commented out due to ES module import issues (see index.ts lines 161-163)

## Testing Approach

- Jest with ts-jest for TypeScript support
- Test files located in `src/__tests__/`
- Coverage reports generated in `coverage/` directory
- Integration tests for WebSocket and GNU Backgammon components

## WebSocket Architecture

The AI package includes a WebSocket client for real-time game analysis:
- Connects to game server for live game events
- Automatic reconnection handling

## Build Process

1. TypeScript compilation to `dist/` directory
2. GNU Backgammon binary copying (if available)
3. Post-install script for dependency setup
4. Declaration files generated for type exports