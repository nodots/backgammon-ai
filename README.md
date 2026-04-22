# @nodots/backgammon-ai

Robot move selection, cube decisions, and move analysis for [Nodots Backgammon](https://backgammon.nodots.com). Built on [`@nodots/gnubg-hints`](https://www.npmjs.com/package/@nodots/gnubg-hints), which runs GNU Backgammon evaluations in-process.

## Install

```sh
npm install @nodots/backgammon-ai @nodots/backgammon-core
```

## Quick start

```ts
import { Game } from '@nodots/backgammon-core'
import {
  initializeGnubgHints,
  executeRobotTurnWithGNU,
  shutdownGnubgHints,
} from '@nodots/backgammon-ai'

await initializeGnubgHints()

const game = Game.createNewGame(
  { userId: 'alice', isRobot: false },
  { userId: 'bob',   isRobot: true  },
)
const rolled = Game.roll(Game.rollForStart(game))

// One call drives the full robot turn: picks the best move sequence,
// applies every die, and returns the updated game.
const after = await executeRobotTurnWithGNU(rolled)

await shutdownGnubgHints()
```

## API surface

| Export | Purpose |
| --- | --- |
| `initializeGnubgHints`, `shutdownGnubgHints`, `configureGnubgHints` | Lifecycle for the native hints session. |
| `executeRobotTurnWithGNU` | One-call, state-preserving robot turn driver. |
| `getBestMove`, `getMoveHints` | Full checker-play evaluations. |
| `getDoubleHint`, `getTakeHint` | Cube decisions. |
| `GNUAIProvider`, `NodotsAIProvider`, `registerAIProvider` | Pluggable provider interface for custom engines. |
| `moveAnalyzers`, `moveSelection`, `selectMoveFromList` | Lower-level hooks for trainers and analyzers. |
| `luckCalculator` | Per-roll luck decomposition. |
| `DEFAULT_HINTS_CONFIG` | Default search depth, noise, and filter settings. |

## Pluggable analyzers

Every candidate move passes through an ordered list of analyzers before selection. Register your own via `pluginLoader` — useful for building tutors, trainers, or bespoke engines that bias toward specific position types.

## Strength

GNU Backgammon plays in the 2000+ FIBS rating class with full cubeful evaluations. See the [Nodots dice-fairness white paper](https://github.com/nodots/backgammon/blob/main/docs/white-papers/12-dice-fairness.md) for how rolls are generated and tested against an XG/BGBlitz-comparable standard.

## Ecosystem

| Package | Role |
| --- | --- |
| [`@nodots/backgammon-types`](https://www.npmjs.com/package/@nodots/backgammon-types) | Discriminated-union type contracts. |
| [`@nodots/backgammon-core`](https://www.npmjs.com/package/@nodots/backgammon-core) | Game logic. |
| [`@nodots/backgammon-ai`](https://www.npmjs.com/package/@nodots/backgammon-ai) | AI (this package). |
| [`@nodots/backgammon-api-utils`](https://www.npmjs.com/package/@nodots/backgammon-api-utils) | Request, response, and WebSocket contracts. |
| [`@nodots/backgammon-cli`](https://www.npmjs.com/package/@nodots/backgammon-cli) | Terminal client (`ndbg`). |
| [`@nodots/gnubg-hints`](https://www.npmjs.com/package/@nodots/gnubg-hints) | Native GNU Backgammon hints addon. |

Hosted product: [backgammon.nodots.com](https://backgammon.nodots.com).

## License

GPL-3.0. This package bridges to GNU Backgammon (itself GPL-3.0); see [`@nodots/gnubg-hints`](https://www.npmjs.com/package/@nodots/gnubg-hints) for details on the native bindings.
