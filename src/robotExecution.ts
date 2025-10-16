/**
 * Robot Turn Execution with GNU Backgammon
 *
 * This module contains GNU-specific logic for executing complete robot turns.
 * It was moved from @nodots-llc/backgammon-core to maintain separation of concerns
 * and keep GNU dependencies isolated to the AI package.
 */

import {
  BackgammonGameMoving,
  BackgammonGameRolling,
  BackgammonMoveDestination,
  BackgammonMoveDirection,
  BackgammonMoveOrigin,
  BackgammonPlayerInactive,
  BackgammonPlayerRolling,
  BackgammonPlayersRollingTuple,
  BackgammonRoll,
} from '@nodots-llc/backgammon-types'
import { GnuBgHints, MoveStep } from '@nodots-llc/gnubg-hints'
import { Board } from '@nodots-llc/backgammon-core'

// Simple logger to avoid circular dependency issues
const logger = {
  debug: (msg: string, ...args: any[]) => console.log(`[AI] [DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) => console.log(`[AI] [INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[AI] [WARN] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[AI] [ERROR] ${msg}`, ...args),
}

/**
 * Convert GNU Backgammon move step to Nodots checker containers
 *
 * Maps GNU's position notation to Nodots' checker container system,
 * handling point-to-point moves, bear-offs, and bar re-entries.
 */
const getCheckercontainersForGnuStep = (
  move: MoveStep,
  game: BackgammonGameMoving
): {
  origin: BackgammonMoveOrigin
  destination: BackgammonMoveDestination
  direction: BackgammonMoveDirection
} => {
  const { activePlayer, board } = game
  const gnuTo = move.to
  const gnuFrom = move.from
  const gnuMoveKind = move.moveKind
  const gnuColor = move.player
  let origin: BackgammonMoveOrigin | undefined = undefined
  let destination: BackgammonMoveDestination | undefined = undefined
  const direction: BackgammonMoveDirection =
    gnuColor === 'white' ? 'counterclockwise' : 'clockwise'
  switch (gnuMoveKind) {
    case 'point-to-point':
      {
        origin = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuFrom
        )
        destination = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuTo
        )
        if (!origin || !destination)
          throw new Error(
            `Missing Nodots origin ${JSON.stringify(origin)} or destination ${JSON.stringify(destination)}`
          )
      }
      break
    case 'bear-off':
      {
        {
          origin = board.points.find(
            (p) => p.position[activePlayer.direction] === gnuFrom
          )
          if (!origin)
            throw new Error(`Invalid origin for ${JSON.stringify(move)}`)
          destination = board.off[activePlayer.direction]
        }
      }
      break

    case 'reenter':
      {
        origin = board.bar[activePlayer.direction]
        destination = board.points.find(
          (p) => p.position[activePlayer.direction] === gnuTo
        )
        if (!destination)
          throw new Error(`Invalid destination for ${JSON.stringify(move)}`)
      }
      break
    default:
      throw new Error(`Invalid move kind ${gnuMoveKind}`)
  }
  logger.debug(
    'getCheckercontainersForGnuStep origin, destination:',
    origin,
    destination
  )
  return { origin, destination, direction }
}

/**
 * Execute a complete robot turn using GNU Backgammon hints
 *
 * This function:
 * 1. Initializes GNU Backgammon engine
 * 2. Requests hints for the current position
 * 3. Executes the top-ranked move sequence
 * 4. Transitions game state to rolling for next player
 *
 * @param game - Game in moving state with robot as active player
 * @returns Game in rolling state ready for next player
 * @throws Error if gnuPositionId is missing
 * @throws Error if GNU Backgammon returns no hints
 * @throws Error if move execution fails
 */
export const executeRobotTurnWithGNU = async (
  game: BackgammonGameMoving
): Promise<BackgammonGameRolling> => {
  const { activePlay, activePlayer, inactivePlayer, gnuPositionId, board } =
    game
  const currentRoll: BackgammonRoll = [
    activePlay.moves[0].dieValue,
    activePlay.moves[1].dieValue,
  ]
  if (!gnuPositionId) throw Error(`No gnuPositionId for ${game.id}`)

  await GnuBgHints.initialize()

  const hints = await GnuBgHints.getHintsFromPositionId(
    gnuPositionId,
    currentRoll,
    1
  )
  if (!hints || hints.length === 0)
    throw new Error(
      `gnubg-hints returned no moves for ${gnuPositionId} ${JSON.stringify(currentRoll)}`
    )
  const hint = hints[0]

  let updateableBoard = game.board
  let updateableGame = game

  // Validate board structure before processing moves
  if (!updateableBoard.points || !Array.isArray(updateableBoard.points)) {
    throw new Error('Invalid board structure: missing or invalid points array')
  }

  hint.moves.forEach((m, index) => {
    // Use the updated game state with current board for each move
    const gameWithUpdatedBoard = {
      ...updateableGame,
      board: updateableBoard,
    }
    const { origin, destination, direction } = getCheckercontainersForGnuStep(
      m,
      gameWithUpdatedBoard
    )

    updateableBoard = Board.moveChecker(
      updateableBoard,
      origin,
      destination,
      direction
    )

    // Validate board structure after each move
    if (!updateableBoard.points || !Array.isArray(updateableBoard.points)) {
      throw new Error(`Board structure corrupted after move ${index + 1}`)
    }

    // Validate all points have checkers arrays
    for (const point of updateableBoard.points) {
      if (!Array.isArray(point.checkers)) {
        throw new Error(
          `Point ${point.id} missing checkers array after move ${index + 1}`
        )
      }
    }

    // Update the game reference for next iteration
    updateableGame = gameWithUpdatedBoard
  })

  const robotAfterMove: BackgammonPlayerInactive = {
    ...activePlayer,
    stateKind: 'inactive',
    dice: {
      ...activePlayer.dice,
      stateKind: 'inactive',
    },
  }

  const nextPlayerAfterMove: BackgammonPlayerRolling = {
    ...inactivePlayer,
    stateKind: 'rolling',
    dice: {
      ...inactivePlayer.dice,
      stateKind: 'rolling',
    },
  }

  const players: BackgammonPlayersRollingTuple = [
    nextPlayerAfterMove,
    robotAfterMove,
  ]

  return {
    ...game,
    players,
    board: updateableBoard,
    activeColor: nextPlayerAfterMove.color,
    stateKind: 'rolling',
    activePlayer: nextPlayerAfterMove,
    inactivePlayer: robotAfterMove,
    activePlay: undefined,
  }
}
