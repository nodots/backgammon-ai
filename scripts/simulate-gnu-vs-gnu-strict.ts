#!/usr/bin/env node
/**
 * GNU vs GNU simulation using the strict robot execution path.
 *
 * Usage:
 *   node --loader ts-node/esm scripts/simulate-gnu-vs-gnu-strict.ts --games=5 --maxTurns=400
 */
import type {
  BackgammonGame,
  BackgammonGameDoubled,
  BackgammonGameMoved,
  BackgammonGameMoving,
  BackgammonGameRolledForStart,
  BackgammonGameRolling,
  BackgammonGameRollingForStart,
} from '@nodots-llc/backgammon-types'
import { Game, Player } from '@nodots-llc/backgammon-core'
import { registerAIProvider } from '../src/index.js'

const parseArg = (name: string, def: number) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!arg) return def
  const v = parseInt(arg.split('=')[1] || '', 10)
  return Number.isFinite(v) ? v : def
}

async function simulateOne(gameIndex: number, maxTurns: number): Promise<{
  winner: 'white' | 'black' | null
  turns: number
}> {
  const white = Player.initialize('white', 'clockwise', 'rolling-for-start', true)
  const black = Player.initialize('black', 'counterclockwise', 'rolling-for-start', true)
  const players = [white, black] as [typeof white, typeof black]

  let state: BackgammonGame = Game.initialize(players) as BackgammonGameRollingForStart
  let turns = 0

  while (turns < maxTurns) {
    switch (state.stateKind) {
      case 'rolling-for-start':
        state = Game.rollForStart(state as BackgammonGameRollingForStart)
        break
      case 'rolled-for-start':
      case 'rolling':
        state = Game.roll(
          state as BackgammonGameRolledForStart | BackgammonGameRolling
        )
        break
      case 'moving':
        state = await Game.executeRobotTurn(state as BackgammonGameMoving)
        turns += 1
        break
      case 'moved':
        state = Game.confirmTurn(state as BackgammonGameMoved)
        turns += 1
        break
      case 'doubled':
        try {
          const responder = (state as BackgammonGameDoubled).inactivePlayer as any
          state = Game.acceptDouble(
            state as BackgammonGameDoubled,
            responder
          )
        } catch {
          const responder = (state as BackgammonGameDoubled).inactivePlayer as any
          state = Game.refuseDouble(
            state as BackgammonGameDoubled,
            responder
          )
        }
        break
      case 'completed':
        return {
          winner:
            state.winner === white.id ? 'white' : state.winner === black.id ? 'black' : null,
          turns,
        }
      default:
        // If some intermediate state appears, try to nudge completion.
        state = Game.checkAndCompleteTurn(state as any)
        break
    }
  }

  return { winner: null, turns }
}

async function main() {
  await registerAIProvider()

  const games = parseArg('games', 5)
  const maxTurns = parseArg('maxTurns', 400)

  let whiteWins = 0
  let blackWins = 0

  for (let i = 1; i <= games; i++) {
    const result = await simulateOne(i, maxTurns)
    if (result.winner === 'white') whiteWins++
    if (result.winner === 'black') blackWins++
    console.log(
      `Game ${i}/${games}: winner=${result.winner ?? 'none'} turns=${result.turns}`
    )
  }

  console.log(`\nSummary: white=${whiteWins}, black=${blackWins}, total=${games}`)
}

main().catch((error) => {
  console.error('Simulation failed:', error)
  process.exit(1)
})
