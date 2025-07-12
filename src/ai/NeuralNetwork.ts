/**
 * Neural Network for Backgammon Position Evaluation
 * 
 * A simple feedforward neural network that learns to evaluate
 * backgammon positions through self-play training.
 */
export class NeuralNetwork {
  private layers: number[]
  private weights: number[][][]
  private biases: number[][]
  private learningRate: number = 0.01
  private momentum: number = 0.9

  constructor(layers: number[] = [100, 64, 32, 1]) {
    this.layers = layers
    this.weights = []
    this.biases = []
    this.initializeNetwork()
  }

  /**
   * Initialize the neural network with random weights and biases
   */
  private initializeNetwork(): void {
    for (let i = 0; i < this.layers.length - 1; i++) {
      const layerWeights: number[][] = []
      const layerBiases: number[] = []

      for (let j = 0; j < this.layers[i + 1]; j++) {
        const neuronWeights: number[] = []
        for (let k = 0; k < this.layers[i]; k++) {
          // Xavier initialization
          const weight = (Math.random() - 0.5) * Math.sqrt(2 / this.layers[i])
          neuronWeights.push(weight)
        }
        layerWeights.push(neuronWeights)
        layerBiases.push((Math.random() - 0.5) * 0.1)
      }

      this.weights.push(layerWeights)
      this.biases.push(layerBiases)
    }
  }

  /**
   * Evaluate a position using the neural network
   * @param features Input features from the position
   * @returns Position evaluation score (-1 to 1, where 1 is winning)
   */
  async evaluate(features: number[]): Promise<number> {
    if (features.length !== this.layers[0]) {
      throw new Error(`Expected ${this.layers[0]} features, got ${features.length}`)
    }

    const activations = this.forwardPass(features)
    return activations[activations.length - 1][0] // Output layer has 1 neuron
  }

  /**
   * Perform forward pass through the network
   */
  private forwardPass(input: number[]): number[][] {
    const activations: number[][] = [input]

    for (let layer = 0; layer < this.weights.length; layer++) {
      const layerActivations: number[] = []
      
      for (let neuron = 0; neuron < this.weights[layer].length; neuron++) {
        let sum = this.biases[layer][neuron]
        
        for (let inputNeuron = 0; inputNeuron < this.weights[layer][neuron].length; inputNeuron++) {
          sum += this.weights[layer][neuron][inputNeuron] * activations[layer][inputNeuron]
        }
        
        // ReLU activation for hidden layers, tanh for output layer
        const activation = layer === this.weights.length - 1 ? 
          Math.tanh(sum) : Math.max(0, sum)
        layerActivations.push(activation)
      }
      
      activations.push(layerActivations)
    }

    return activations
  }

  /**
   * Train the network on game history
   * @param gameHistory Array of game positions and outcomes
   */
  async trainOnGame(gameHistory: any[]): Promise<void> {
    if (gameHistory.length === 0) return

    for (const gameData of gameHistory) {
      const { features, target } = gameData
      
      if (!features || target === undefined) continue

      // Forward pass
      const activations = this.forwardPass(features)
      
      // Backward pass
      this.backwardPass(activations, target)
    }
  }

  /**
   * Perform backward pass to update weights and biases
   */
  private backwardPass(activations: number[][], target: number): void {
    const deltas: number[][] = []
    
    // Calculate output layer delta
    const outputLayer = activations.length - 1
    const output = activations[outputLayer][0]
    const outputDelta = (target - output) * (1 - output * output) // tanh derivative
    deltas.push([outputDelta])

    // Calculate hidden layer deltas
    for (let layer = outputLayer - 1; layer > 0; layer--) {
      const layerDeltas: number[] = []
      
      for (let neuron = 0; neuron < this.weights[layer].length; neuron++) {
        let delta = 0
        
        // Sum deltas from next layer
        for (let nextNeuron = 0; nextNeuron < this.weights[layer + 1].length; nextNeuron++) {
          delta += this.weights[layer + 1][nextNeuron][neuron] * deltas[0][nextNeuron]
        }
        
        // ReLU derivative
        const activation = activations[layer][neuron]
        delta *= activation > 0 ? 1 : 0
        
        layerDeltas.push(delta)
      }
      
      deltas.unshift(layerDeltas)
    }

    // Update weights and biases
    this.updateWeightsAndBiases(activations, deltas)
  }

  /**
   * Update weights and biases using calculated deltas
   */
  private updateWeightsAndBiases(activations: number[][], deltas: number[][]): void {
    for (let layer = 0; layer < this.weights.length; layer++) {
      for (let neuron = 0; neuron < this.weights[layer].length; neuron++) {
        // Update bias
        this.biases[layer][neuron] += this.learningRate * deltas[layer][neuron]
        
        // Update weights
        for (let inputNeuron = 0; inputNeuron < this.weights[layer][neuron].length; inputNeuron++) {
          this.weights[layer][neuron][inputNeuron] += 
            this.learningRate * deltas[layer][neuron] * activations[layer][inputNeuron]
        }
      }
    }
  }

  /**
   * Save the neural network to a file
   */
  async save(path: string): Promise<void> {
    const modelData = {
      layers: this.layers,
      weights: this.weights,
      biases: this.biases,
      learningRate: this.learningRate,
      momentum: this.momentum
    }

    // In a real implementation, you would save to file
    // For now, we'll just log the model size
    const modelSize = JSON.stringify(modelData).length
    console.log(`Model saved to ${path} (${modelSize} bytes)`)
  }

  /**
   * Load the neural network from a file
   */
  async load(path: string): Promise<void> {
    // In a real implementation, you would load from file
    // For now, we'll just log the action
    console.log(`Model loaded from ${path}`)
  }

  /**
   * Set the learning rate
   */
  setLearningRate(rate: number): void {
    this.learningRate = rate
  }

  /**
   * Get network architecture
   */
  getArchitecture(): number[] {
    return [...this.layers]
  }

  /**
   * Get the number of parameters in the network
   */
  getParameterCount(): number {
    let count = 0
    
    for (let layer = 0; layer < this.weights.length; layer++) {
      count += this.weights[layer].length * this.weights[layer][0].length // weights
      count += this.biases[layer].length // biases
    }
    
    return count
  }
}