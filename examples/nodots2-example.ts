import { Nodots2AI, Nodots2Trainer, FeatureExtractor } from '../src'

/**
 * Example usage of Nodots2 AI Engine
 * 
 * This example demonstrates:
 * 1. Basic move selection with Nodots2 AI
 * 2. Position evaluation
 * 3. Training the AI
 * 4. Comparing with other analyzers
 */

async function main() {
  console.log('🎲 Nodots2 AI Engine Example')
  console.log('============================\n')

  // 1. Create Nodots2 AI instance
  console.log('1. Initializing Nodots2 AI...')
  const nodots2AI = new Nodots2AI()
  const featureExtractor = new FeatureExtractor()

  // 2. Example position (simplified)
  const examplePosition = {
    board: {
      1: { checkers: 2, owner: 'opponent' },
      6: { checkers: 5, owner: 'player' },
      8: { checkers: 3, owner: 'player' },
      12: { checkers: 5, owner: 'opponent' },
      13: { checkers: 5, owner: 'player' },
      17: { checkers: 3, owner: 'opponent' },
      19: { checkers: 5, owner: 'opponent' },
      24: { checkers: 2, owner: 'player' }
    },
    bar: { player: 0, opponent: 0 },
    off: { player: 0, opponent: 0 },
    cube: { value: 1, owner: null }
  }

  // 3. Extract features from position
  console.log('2. Extracting features from position...')
  const features = featureExtractor.extractFeatures(examplePosition)
  console.log(`   Extracted ${features.length} features`)
  console.log(`   Sample features: [${features.slice(0, 5).map(f => f.toFixed(3)).join(', ')}...]`)

  // 4. Evaluate position
  console.log('\n3. Evaluating position...')
  try {
    const evaluation = await nodots2AI.evaluatePosition(examplePosition)
    console.log(`   Position evaluation: ${evaluation.toFixed(3)}`)
    console.log(`   Interpretation: ${evaluation > 0 ? 'Player advantage' : 'Opponent advantage'}`)
  } catch (error) {
    console.log('   Position evaluation failed:', error)
  }

  // 5. Example moves (simplified)
  const exampleMoves = [
    { dieValue: 6, description: 'Move 6 pips' },
    { dieValue: 4, description: 'Move 4 pips' },
    { dieValue: 2, description: 'Move 2 pips' }
  ]

  // 6. Select best move
  console.log('\n4. Selecting best move...')
  try {
    const bestMove = await nodots2AI.selectMove(exampleMoves, { position: examplePosition })
    if (bestMove) {
      console.log(`   Best move: ${bestMove.description} (${bestMove.dieValue} pips)`)
      
      // Get move confidence
      const confidence = await nodots2AI.getMoveConfidence(bestMove, { position: examplePosition })
      console.log(`   Move confidence: ${(confidence * 100).toFixed(1)}%`)
    } else {
      console.log('   No move selected')
    }
  } catch (error) {
    console.log('   Move selection failed:', error)
  }

  // 7. Training example
  console.log('\n5. Training example...')
  console.log('   Starting Nodots2 trainer...')
  
  const trainer = new Nodots2Trainer()
  
  // Start a short training session
  try {
    await trainer.startTraining({
      episodes: 10, // Small number for demo
      saveInterval: 5,
      evaluationInterval: 5
    })
    
    // Get training statistics
    const stats = trainer.getTrainingStats()
    console.log('\n   Training completed!')
    console.log(`   Games played: ${stats.gamesPlayed}`)
    console.log(`   Win rate: ${(stats.winRate * 100).toFixed(1)}%`)
    console.log(`   Average game length: ${stats.averageGameLength.toFixed(1)} moves`)
  } catch (error) {
    console.log('   Training failed:', error)
  }

  // 8. Performance comparison
  console.log('\n6. Performance comparison...')
  console.log('   Nodots2 AI vs Simple Heuristics:')
  console.log('   - Nodots2 uses neural networks and MCTS')
  console.log('   - Original Nodots uses basic heuristics')
  console.log('   - Nodots2 should provide more sophisticated analysis')

  console.log('\n✅ Example completed!')
  console.log('\nNext steps:')
  console.log('1. Train the AI with more episodes (1000+)')
  console.log('2. Integrate with actual backgammon game engine')
  console.log('3. Add more sophisticated position evaluation')
  console.log('4. Implement self-play training with real games')
  console.log('5. Compare performance against GNU Backgammon')
}

// Run the example
main().catch(console.error)

export { main }