/**
 * Test to reproduce the bar reentry dice usage bug
 * 
 * Bug: When white has a checker on the bar with dice [5,1]:
 * 1. First move: Bar → 20 using die 5 (correct)
 * 2. Second move: 18 → 13 using die 5 AGAIN (incorrect - should use die 1)
 * 
 * This bug was introduced in commit 48c4a318 which removed 'rolled' states
 */

import { describe, it, expect } from '@jest/globals'
import { Board, Play } from '@nodots-llc/backgammon-core'
import type { BackgammonPlayerMoving, BackgammonBar } from '@nodots-llc/backgammon-types'

describe('Bar reentry dice usage bug', () => {
  it('should not allow using the same die value twice after bar reentry', () => {
    // Set up board with white on bar
    const board = Board.initialize()
    
    // Put a white checker on the bar
    const bar = board.bar.counterclockwise as BackgammonBar
    bar.checkers.push({
      id: 'white-checker-on-bar',
      color: 'white',
      isMovable: true,
      checkercontainerId: bar.id
    })
    
    // Put white checkers at position 18 (counterclockwise)
    const point18 = board.points.find(p => p.position.counterclockwise === 18)!
    point18.checkers = [
      {
        id: 'white-checker-at-18',
        color: 'white',
        isMovable: true,
        checkercontainerId: point18.id
      }
    ]
    
    // Set up white player with dice [5,1]
    const whitePlayer: BackgammonPlayerMoving = {
      id: 'white-player',
      userId: 'user1',
      color: 'white',
      direction: 'counterclockwise',
      stateKind: 'moving',
      dice: {
        id: 'white-dice',
        color: 'white',
        stateKind: 'rolled',
        currentRoll: [5, 1],
        total: 6
      },
      pipCount: 150,
      isRobot: false,
      rollForStartValue: 4 as any
    }
    
    // Initialize play with the board and player
    const activePlay = Play.initialize(board, whitePlayer)
    
    // Check the initial moves created
    const initialMoves = activePlay.moves
    console.log('Initial moves:', initialMoves.map(m => ({
      dieValue: m.dieValue,
      moveKind: m.moveKind,
      stateKind: m.stateKind
    })))
    
    // First move should be a reenter from bar
    const reenterMove = initialMoves.find(m => m.moveKind === 'reenter' && m.stateKind === 'ready')
    expect(reenterMove).toBeDefined()
    expect(reenterMove?.dieValue).toBe(5) // Should use die 5 for reentry
    
    // Execute the bar reentry move
    const afterReentry = Play.move(board, activePlay, bar)
    
    // Check remaining moves after reentry - handle the PlayResult type
    if (!('play' in afterReentry) || !afterReentry.play || !('moves' in afterReentry.play)) {
      throw new Error('Unexpected result from Play.move')
    }
    const remainingMoves = Array.from((afterReentry.play as any).moves)
    const readyMoves = remainingMoves.filter((m: any) => m.stateKind === 'ready')
    
    console.log('After reentry, remaining ready moves:', readyMoves.map((m: any) => ({
      dieValue: m.dieValue,
      moveKind: m.moveKind
    })))
    
    // The next ready move should use die 1, NOT die 5 again
    expect(readyMoves.length).toBe(1)
    expect((readyMoves[0] as any).dieValue).toBe(1) // MUST be die 1, not die 5
    
    // Verify that we cannot make a 5-pip move from position 18
    const point18Move = readyMoves.find((m: any) => {
      if (m.possibleMoves && m.possibleMoves.length > 0) {
        const origin = m.possibleMoves[0].origin
        return origin.kind === 'point' && 
               (origin.position as any).counterclockwise === 18
      }
      return false
    }) as any
    
    if (point18Move) {
      // If there's a move from position 18, it should only be able to move 1 pip
      expect(point18Move.dieValue).toBe(1)
      
      // The destination should be position 17 (18 - 1), not position 13 (18 - 5)
      const destination = point18Move.possibleMoves![0].destination
      expect((destination.position as any).counterclockwise).toBe(17)
    }
  })
  
  it('should correctly track used dice for mixed rolls with bar reentry', () => {
    // This test ensures dice tracking works correctly for non-doubles
    const board = Board.initialize()
    
    // Put two white checkers on the bar
    const bar = board.bar.counterclockwise as BackgammonBar
    bar.checkers.push(
      {
        id: 'white-checker-1',
        color: 'white',
        isMovable: true,
        checkercontainerId: bar.id
      },
      {
        id: 'white-checker-2',
        color: 'white',
        isMovable: true,
        checkercontainerId: bar.id
      }
    )
    
    // White player with dice [4,2]
    const whitePlayer: BackgammonPlayerMoving = {
      id: 'white-player',
      userId: 'user1',
      color: 'white',
      direction: 'counterclockwise',
      stateKind: 'moving',
      dice: {
        id: 'white-dice',
        color: 'white',
        stateKind: 'rolled',
        currentRoll: [4, 2],
        total: 6
      },
      pipCount: 150,
      isRobot: false,
      rollForStartValue: 4 as any
    }
    
    const activePlay = Play.initialize(board, whitePlayer)
    const moves = activePlay.moves
    
    // Both moves should be reenter moves with different die values
    const reenterMoves = moves.filter(m => m.moveKind === 'reenter')
    expect(reenterMoves.length).toBe(2)
    
    const dieValues = reenterMoves.map(m => m.dieValue).sort()
    expect(dieValues).toEqual([2, 4]) // Each die used exactly once
  })
})
