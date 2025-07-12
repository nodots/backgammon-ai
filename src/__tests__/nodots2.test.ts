import { Nodots2AI } from '../ai/Nodots2AI'
import { FeatureExtractor } from '../ai/FeatureExtractor'
import { NeuralNetwork } from '../ai/NeuralNetwork'
import { MonteCarloTreeSearch } from '../ai/MonteCarloTreeSearch'

describe('Nodots2 AI Components', () => {
  describe('FeatureExtractor', () => {
    let extractor: FeatureExtractor

    beforeEach(() => {
      extractor = new FeatureExtractor()
    })

    test('should extract features from position', () => {
      const position = {
        board: {
          1: { checkers: 2, owner: 'opponent' },
          6: { checkers: 5, owner: 'player' },
          24: { checkers: 2, owner: 'player' }
        },
        bar: { player: 0, opponent: 0 },
        off: { player: 0, opponent: 0 },
        cube: { value: 1, owner: null }
      }

      const features = extractor.extractFeatures(position)
      
      expect(features).toBeDefined()
      expect(Array.isArray(features)).toBe(true)
      expect(features.length).toBeGreaterThan(0)
      expect(features.every(f => typeof f === 'number')).toBe(true)
    })

    test('should handle null position', () => {
      const features = extractor.extractFeatures(null)
      
      expect(features).toBeDefined()
      expect(Array.isArray(features)).toBe(true)
      expect(features.length).toBeGreaterThan(0)
    })
  })

  describe('NeuralNetwork', () => {
    let network: NeuralNetwork

    beforeEach(() => {
      network = new NeuralNetwork([100, 64, 32, 1])
    })

    test('should evaluate features', async () => {
      const features = new Array(100).fill(0.5)
      const evaluation = await network.evaluate(features)
      
      expect(evaluation).toBeDefined()
      expect(typeof evaluation).toBe('number')
      expect(evaluation >= -1 && evaluation <= 1).toBe(true)
    })

    test('should handle training', async () => {
      const gameHistory = [
        { features: [0.5, 0.3, 0.2], target: 0.8 },
        { features: [0.2, 0.7, 0.1], target: -0.3 }
      ]

      await expect(network.trainOnGame(gameHistory)).resolves.not.toThrow()
    })

    test('should get architecture', () => {
      const architecture = network.getArchitecture()
      
      expect(architecture).toEqual([100, 64, 32, 1])
    })

    test('should get parameter count', () => {
      const paramCount = network.getParameterCount()
      
      expect(paramCount).toBeGreaterThan(0)
      expect(typeof paramCount).toBe('number')
    })
  })

  describe('MonteCarloTreeSearch', () => {
    let mcts: MonteCarloTreeSearch
    let network: NeuralNetwork

    beforeEach(() => {
      network = new NeuralNetwork([100, 64, 32, 1])
      mcts = new MonteCarloTreeSearch(network)
    })

    test('should find best move', async () => {
      const features = new Array(100).fill(0.5)
      const moves = [
        { dieValue: 6, description: 'Move 6' },
        { dieValue: 4, description: 'Move 4' },
        { dieValue: 2, description: 'Move 2' }
      ]

      const bestMove = await mcts.findBestMove(features, moves, {
        iterations: 10,
        timeLimit: 100,
        explorationConstant: 1.414
      })

      expect(bestMove).toBeDefined()
      expect(moves).toContain(bestMove)
    })

    test('should handle empty moves', async () => {
      const features = new Array(100).fill(0.5)
      const moves: any[] = []

      const bestMove = await mcts.findBestMove(features, moves, {
        iterations: 10,
        timeLimit: 100,
        explorationConstant: 1.414
      })

      expect(bestMove).toBeNull()
    })

    test('should get move confidence', async () => {
      const features = new Array(100).fill(0.5)
      const move = { dieValue: 6, description: 'Move 6' }

      const confidence = await mcts.getMoveConfidence(features, move)

      expect(confidence).toBeDefined()
      expect(typeof confidence).toBe('number')
      expect(confidence >= 0 && confidence <= 1).toBe(true)
    })
  })

  describe('Nodots2AI', () => {
    let ai: Nodots2AI

    beforeEach(() => {
      ai = new Nodots2AI()
    })

    test('should select move', async () => {
      const moves = [
        { dieValue: 6, description: 'Move 6' },
        { dieValue: 4, description: 'Move 4' },
        { dieValue: 2, description: 'Move 2' }
      ]

      const position = {
        board: {
          1: { checkers: 2, owner: 'opponent' },
          6: { checkers: 5, owner: 'player' }
        },
        bar: { player: 0, opponent: 0 },
        off: { player: 0, opponent: 0 },
        cube: { value: 1, owner: null }
      }

      const bestMove = await ai.selectMove(moves, { position })

      expect(bestMove).toBeDefined()
      expect(moves).toContain(bestMove)
    })

    test('should handle empty moves', async () => {
      const moves: any[] = []
      const position = {}

      const bestMove = await ai.selectMove(moves, { position })

      expect(bestMove).toBeNull()
    })

    test('should evaluate position', async () => {
      const position = {
        board: {
          1: { checkers: 2, owner: 'opponent' },
          6: { checkers: 5, owner: 'player' }
        },
        bar: { player: 0, opponent: 0 },
        off: { player: 0, opponent: 0 },
        cube: { value: 1, owner: null }
      }

      const evaluation = await ai.evaluatePosition(position)

      expect(evaluation).toBeDefined()
      expect(typeof evaluation).toBe('number')
      expect(evaluation >= -1 && evaluation <= 1).toBe(true)
    })

    test('should get move confidence', async () => {
      const move = { dieValue: 6, description: 'Move 6' }
      const position = {
        board: {
          1: { checkers: 2, owner: 'opponent' },
          6: { checkers: 5, owner: 'player' }
        },
        bar: { player: 0, opponent: 0 },
        off: { player: 0, opponent: 0 },
        cube: { value: 1, owner: null }
      }

      const confidence = await ai.getMoveConfidence(move, { position })

      expect(confidence).toBeDefined()
      expect(typeof confidence).toBe('number')
      expect(confidence >= 0 && confidence <= 1).toBe(true)
    })

    test('should train', async () => {
      await expect(ai.train(5)).resolves.not.toThrow()
    })
  })
})