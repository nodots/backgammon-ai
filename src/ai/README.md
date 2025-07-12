# Nodots2 AI Engine

A sophisticated backgammon AI engine that combines neural networks, Monte Carlo Tree Search (MCTS), and advanced feature extraction to provide world-class backgammon analysis.

## 🧠 Architecture Overview

Nodots2 AI uses a multi-layered approach inspired by modern game AI systems like AlphaGo and AlphaZero:

```
┌─────────────────────────────────────────────────────────────┐
│                    Nodots2 AI Engine                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   MCTS      │  │   Neural    │  │  Feature    │         │
│  │  Search     │  │  Network    │  │ Extractor   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Position    │  │ Training    │  │ Self-Play   │         │
│  │ Evaluator   │  │ System      │  │ Engine      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Key Features

### 1. **Neural Network Evaluation**
- Feedforward neural network with configurable architecture
- Learns position evaluation through self-play training
- Supports saving/loading trained models
- Uses ReLU activation for hidden layers, tanh for output

### 2. **Monte Carlo Tree Search (MCTS)**
- Combines neural network evaluation with tree search
- Uses UCB1 formula for exploration vs exploitation
- Configurable search depth and time limits
- Provides move confidence scores

### 3. **Advanced Feature Extraction**
- 100+ numerical features from board positions
- Strategic features (primes, anchors, blots)
- Tactical features (hitting chances, blocking)
- Game state features (race position, cube state)

### 4. **Self-Play Training**
- Automated training through self-play games
- Performance monitoring and evaluation
- Model checkpointing and recovery
- Training data export capabilities

## 📦 Components

### Core AI Engine
- **`Nodots2AI`**: Main AI engine that orchestrates all components
- **`NeuralNetwork`**: Neural network for position evaluation
- **`MonteCarloTreeSearch`**: MCTS implementation for move selection
- **`FeatureExtractor`**: Converts board positions to numerical features

### Training System
- **`Nodots2Trainer`**: Handles self-play training and model improvement
- **Training data generation**: Automatic collection of game data
- **Performance monitoring**: Win rates, game lengths, evaluation accuracy

## 🎯 Usage Examples

### Basic Move Selection
```typescript
import { Nodots2AI } from '@nodots-llc/backgammon-ai'

const ai = new Nodots2AI()
const moves = [/* available moves */]
const position = {/* board position */}

const bestMove = await ai.selectMove(moves, { position })
const confidence = await ai.getMoveConfidence(bestMove, { position })
```

### Position Evaluation
```typescript
const evaluation = await ai.evaluatePosition(position)
console.log(`Position evaluation: ${evaluation}`) // -1 to 1
```

### Training the AI
```typescript
import { Nodots2Trainer } from '@nodots-llc/backgammon-ai'

const trainer = new Nodots2Trainer()

await trainer.startTraining({
  episodes: 1000,
  saveInterval: 100,
  evaluationInterval: 50
})
```

### Feature Extraction
```typescript
import { FeatureExtractor } from '@nodots-llc/backgammon-ai'

const extractor = new FeatureExtractor()
const features = extractor.extractFeatures(position)
console.log(`Extracted ${features.length} features`)
```

## 🔧 Configuration

### Neural Network Architecture
```typescript
// Default: [100, 64, 32, 1]
const ai = new Nodots2AI()
// Custom architecture
const neuralNetwork = new NeuralNetwork([150, 100, 50, 25, 1])
```

### MCTS Parameters
```typescript
const options = {
  iterations: 1000,        // Number of MCTS iterations
  timeLimit: 2000,         // Time limit in milliseconds
  explorationConstant: 1.414 // UCB1 exploration constant
}
```

### Training Parameters
```typescript
const trainingOptions = {
  episodes: 1000,          // Number of training games
  saveInterval: 100,       // Save model every N episodes
  evaluationInterval: 50   // Evaluate performance every N episodes
}
```

## 📊 Performance Metrics

The AI tracks several performance metrics during training:

- **Win Rate**: Percentage of games won
- **Average Game Length**: Mean number of moves per game
- **Training Loss**: Neural network training loss
- **Evaluation Accuracy**: Position evaluation accuracy
- **Move Confidence**: Confidence in selected moves

## 🎮 Integration with Backgammon Engine

To integrate Nodots2 AI with your backgammon game:

1. **Position Representation**: Convert your board state to the expected format
2. **Move Generation**: Generate legal moves for the current position
3. **AI Integration**: Use Nodots2 AI to select the best move
4. **Training Integration**: Collect game data for continuous improvement

### Example Integration
```typescript
class BackgammonGame {
  private ai = new Nodots2AI()
  
  async makeAIMove() {
    const position = this.getCurrentPosition()
    const legalMoves = this.generateLegalMoves()
    
    const bestMove = await this.ai.selectMove(legalMoves, { position })
    this.applyMove(bestMove)
  }
  
  async trainOnGame() {
    const gameData = this.collectGameData()
    await this.ai.train(gameData)
  }
}
```

## 🔬 Advanced Features

### Custom Feature Extraction
```typescript
class CustomFeatureExtractor extends FeatureExtractor {
  extractCustomFeatures(position: any): number[] {
    // Add your custom features
    return super.extractFeatures(position).concat([
      this.calculateCustomMetric(position)
    ])
  }
}
```

### Ensemble Methods
```typescript
class EnsembleAI {
  private ais: Nodots2AI[] = []
  
  async selectMove(moves: any[], context: any) {
    const evaluations = await Promise.all(
      this.ais.map(ai => ai.evaluatePosition(context.position))
    )
    
    // Combine evaluations (e.g., weighted average)
    return this.combineEvaluations(evaluations)
  }
}
```

## 🚀 Getting Started

1. **Install the package**:
   ```bash
   npm install @nodots-llc/backgammon-ai
   ```

2. **Run the example**:
   ```bash
   npx ts-node examples/nodots2-example.ts
   ```

3. **Start training**:
   ```typescript
   const trainer = new Nodots2Trainer()
   await trainer.startTraining({ episodes: 1000 })
   ```

4. **Use in your game**:
   ```typescript
   const ai = new Nodots2AI()
   const bestMove = await ai.selectMove(legalMoves, { position })
   ```

## 🔮 Future Enhancements

- **Deep Reinforcement Learning**: Policy gradient methods
- **Attention Mechanisms**: Focus on important board areas
- **Multi-GPU Training**: Parallel training for faster convergence
- **Opening Book**: Pre-computed opening moves
- **Endgame Database**: Perfect play for endgame positions
- **Online Learning**: Continuous improvement during play

## 📚 References

- [Monte Carlo Tree Search](https://en.wikipedia.org/wiki/Monte_Carlo_tree_search)
- [Neural Networks for Game AI](https://arxiv.org/abs/1712.01815)
- [AlphaGo and AlphaZero](https://deepmind.com/research/case-studies/alphago-the-story-so-far)
- [Backgammon Strategy](https://en.wikipedia.org/wiki/Backgammon_strategy)

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- Enhanced feature extraction
- Better neural network architectures
- Improved MCTS algorithms
- Training data generation
- Performance optimization
- Documentation and examples

## 📄 License

This project is part of the Nodots Backgammon ecosystem and follows the same licensing terms.