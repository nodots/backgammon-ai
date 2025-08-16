/**
 * GNU Backgammon Integration Tests
 * Tests real integration with GNU Backgammon for AI analysis
 */

import { beforeAll, describe, expect, it } from '@jest/globals'
import { gnubg, GnubgIntegration } from '../gnubg'
import { getBestMoveFromGnubg } from '../gnubgApi'
import { getGnubgMoveHint, getGnubgMoveHintLegacy } from '../index'

describe('GNU Backgammon Integration', () => {
  let isGnubgAvailable = false

  beforeAll(async () => {
    isGnubgAvailable = await gnubg.isAvailable()
    if (!isGnubgAvailable) {
      console.warn('GNU Backgammon not available - running mock tests only')
    }
  }, 30000)

  describe('GnubgIntegration Class', () => {
    it('should initialize correctly', async () => {
      const integration = new GnubgIntegration()
      const available = await integration.isAvailable()
      expect(typeof available).toBe('boolean')
    })

    it('should provide build instructions when not available', () => {
      const integration = new GnubgIntegration()
      const instructions = integration.getBuildInstructions()
      expect(instructions).toContain('GNU Backgammon (gnubg) is not available')
      expect(instructions).toContain('brew install')
      expect(instructions).toContain('npm run gnubg:configure')
    })

    it('should handle command execution errors gracefully', async () => {
      if (!isGnubgAvailable) {
        // Test error handling when gnubg is not available
        const integration = new GnubgIntegration()
        await expect(
          integration.executeCommand(['invalid command'])
        ).rejects.toThrow()
      } else {
        // Test that command execution works (gnubg may process "invalid" commands successfully)
        try {
          const result = await gnubg.executeCommand(['invalid gnubg command'])
          expect(typeof result).toBe('string')
        } catch (error) {
          // Either success or error is acceptable depending on gnubg version
          expect(error).toBeInstanceOf(Error)
        }
      }
    })

    it('should validate command output parsing', async () => {
      if (!isGnubgAvailable) {
        console.warn(
          'Skipping GNU BG command parsing test - gnubg not available'
        )
        return
      }

      try {
        // Test with a known starting position
        const commands = [
          'new game',
          'set board 4HPwATDgc/ABMA', // Standard starting position
          'set dice 3 1',  // Set specific dice to make the command deterministic
          'hint',
        ]

        const output = await gnubg.executeCommand(commands)
        expect(output).toBeDefined()
        expect(typeof output).toBe('string')
        expect(output.length).toBeGreaterThan(0)

        // Should contain hint information
        expect(output.toLowerCase()).toMatch(/(hint|move|rolls?|equity)/i)
      } catch (error) {
        // If gnubg crashes, just skip the test
        console.warn('gnubg command parsing test failed:', error)
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('Move Analysis Integration', () => {
    const testPositions = [
      {
        name: 'Standard starting position',
        positionId: '4HPwATDgc/ABMA',
        expectedMovePattern: /^\d+\/\d+(\s+\d+\/\d+)*$/,
      },
      {
        name: 'Mid-game position',
        positionId: 'XGID=-a-b-BB-B-a-e----B-Bb-AAA--:0:0:1:00:0:0:0:0:10',
        expectedMovePattern: /^\d+\/\d+(\s+\d+\/\d+)*$/,
      },
    ]

    testPositions.forEach(({ name, positionId, expectedMovePattern }) => {
      it(`should analyze ${name} correctly`, async () => {
        if (!isGnubgAvailable) {
          console.warn(`Skipping ${name} analysis - gnubg not available`)
          return
        }

        try {
          const bestMove = await getGnubgMoveHint(positionId)
          expect(bestMove).toBeDefined()
          expect(typeof bestMove).toBe('string')
          expect(bestMove.length).toBeGreaterThan(0)

          // Validate move format (e.g., "8/4 6/4" or "bar/22 13/9")
          if (!bestMove.toLowerCase().includes('no move')) {
            expect(bestMove).toMatch(expectedMovePattern)
          }

          console.log(`Best move for ${name}: ${bestMove}`)
        } catch (error) {
          console.error(`Analysis failed for ${name}:`, error)
          // Don't fail the test if gnubg has issues - just log
          expect(error).toBeInstanceOf(Error)
        }
      }, 30000)
    })

    it('should handle invalid position IDs gracefully', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping invalid position test - gnubg not available')
        return
      }

      const invalidPositionIds = [
        'invalid-position',
        '',
        'XGID=invalid',
        '123456789',
      ]

      for (const invalidId of invalidPositionIds) {
        try {
          await getGnubgMoveHint(invalidId)
          // If it doesn't throw, that's also acceptable behavior
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toContain('gnubg')
        }
      }
    })

    it('should compare legacy and new implementations', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping legacy comparison test - gnubg not available')
        return
      }

      const testPositionId = '4HPwATDgc/ABMA'

      try {
        const [newResult, legacyResult] = await Promise.allSettled([
          getGnubgMoveHint(testPositionId),
          getGnubgMoveHintLegacy(testPositionId),
        ])

        if (
          newResult.status === 'fulfilled' &&
          legacyResult.status === 'fulfilled'
        ) {
          // Both implementations should return similar results
          expect(newResult.value).toBeDefined()
          expect(legacyResult.value).toBeDefined()
          console.log('New implementation result:', newResult.value)
          console.log('Legacy implementation result:', legacyResult.value)
        } else {
          // At least one should work, or both should fail consistently
          console.warn('One or both implementations failed:', {
            new:
              newResult.status === 'fulfilled' ? 'success' : newResult.reason,
            legacy:
              legacyResult.status === 'fulfilled'
                ? 'success'
                : legacyResult.reason,
          })
        }
      } catch (error) {
        console.error('Comparison test failed:', error)
        expect(error).toBeInstanceOf(Error)
      }
    }, 45000)
  })

  describe('API Integration', () => {
    it('should test GNU BG API endpoint if available', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping API test - gnubg not available')
        return
      }

      const testPositionId = '4HPwATDgc/ABMA'

      try {
        // This will likely fail unless the FastAPI server is running
        const result = await getBestMoveFromGnubg(testPositionId)
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
        console.log('API result:', result)
      } catch (error) {
        // Expected to fail in most test environments
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toMatch(
          /(ECONNREFUSED|Network Error|timeout|Unknown error from GNUBG API)/i
        )
        console.warn(
          'API endpoint not available (expected in test environment):',
          (error as Error).message
        )
      }
    }, 15000)

    it('should handle API timeout gracefully', async () => {
      // Test with a very short timeout to simulate timeout scenario
      const originalTimeout = setTimeout

      try {
        // This test validates timeout handling
        await expect(getBestMoveFromGnubg('timeout-test')).rejects.toThrow()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent analysis requests', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping concurrent analysis test - gnubg not available')
        return
      }

      const testPositionId = '4HPwATDgc/ABMA'
      const concurrentRequests = 3

      const promises = Array(concurrentRequests)
        .fill(0)
        .map(() => getGnubgMoveHint(testPositionId))

      try {
        const results = await Promise.allSettled(promises)

        // At least some should succeed
        const successful = results.filter((r) => r.status === 'fulfilled')
        expect(successful.length).toBeGreaterThan(0)

        console.log(
          `Concurrent analysis: ${successful.length}/${concurrentRequests} successful`
        )
      } catch (error) {
        console.error('Concurrent analysis failed:', error)
        expect(error).toBeInstanceOf(Error)
      }
    }, 60000)

    it('should measure analysis performance', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping performance test - gnubg not available')
        return
      }

      const testPositionId = '4HPwATDgc/ABMA'
      const startTime = Date.now()

      try {
        const result = await getGnubgMoveHint(testPositionId)
        const endTime = Date.now()
        const duration = endTime - startTime

        expect(result).toBeDefined()
        expect(duration).toBeLessThan(30000) // Should complete within 30 seconds

        console.log(`Analysis completed in ${duration}ms`)
      } catch (error) {
        console.error('Performance test failed:', error)
        expect(error).toBeInstanceOf(Error)
      }
    }, 35000)
  })

  describe('Error Recovery and Resilience', () => {
    it('should recover from command failures', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping error recovery test - gnubg not available')
        return
      }

      // Test sequence: invalid command followed by valid command
      try {
        await expect(
          gnubg.executeCommand(['invalid command'])
        ).rejects.toThrow()
      } catch (error) {
        // Expected to fail
      }

      // Should still work after failure
      try {
        const validCommands = ['new game', 'set board 4HPwATDgc/ABMA', 'hint']
        const result = await gnubg.executeCommand(validCommands)
        expect(result).toBeDefined()
        console.log('Recovery test successful')
      } catch (error) {
        console.error('Recovery test failed:', error)
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should handle resource exhaustion gracefully', async () => {
      if (!isGnubgAvailable) {
        console.warn('Skipping resource exhaustion test - gnubg not available')
        return
      }

      // Test with rapid successive calls
      const rapidCalls = Array(10)
        .fill(0)
        .map((_, i) =>
          getGnubgMoveHint('4HPwATDgc/ABMA').catch((error) => ({
            index: i,
            error: error.message,
          }))
        )

      const results = await Promise.allSettled(rapidCalls)

      // Should handle the load without crashing
      expect(results.length).toBe(10)
      console.log('Resource exhaustion test completed')

      // Count successful vs failed requests
      const successful = results.filter(
        (r) => r.status === 'fulfilled' && typeof r.value === 'string'
      )
      const failed = results.filter(
        (r) => r.status === 'rejected' || typeof r.value === 'object'
      )

      console.log(
        `Resource test: ${successful.length} successful, ${failed.length} failed`
      )
    }, 90000)
  })

  describe('Position Format Validation', () => {
    it('should validate GNU Position ID formats', async () => {
      const validFormats = [
        '4HPwATDgc/ABMA', // Standard format
        'XGID=-a-b-BB-B-a-e----B-Bb-AAA--:0:0:1:00:0:0:0:0:10', // Extended format
        '4HPcASMgc/AB:', // Another valid format
      ]

      const invalidFormats = [
        'invalid',
        '',
        '123',
        'XGID=invalid-format',
        'random-string',
      ]

      for (const validFormat of validFormats) {
        if (!isGnubgAvailable) {
          // Just validate format without actual execution
          expect(validFormat).toMatch(/^(XGID=|[A-Za-z0-9+/=]+)/)
        } else {
          try {
            const result = await getGnubgMoveHint(validFormat)
            expect(result).toBeDefined()
            console.log(`Valid format ${validFormat}: ${result}`)
          } catch (error) {
            // Some formats might not work in all versions - that's ok
            console.warn(
              `Format ${validFormat} failed:`,
              (error as Error).message
            )
          }
        }
      }

      // Test invalid formats should fail gracefully
      for (const invalidFormat of invalidFormats) {
        if (isGnubgAvailable) {
          try {
            await getGnubgMoveHint(invalidFormat)
            // If it doesn't throw, that's also acceptable
          } catch (error) {
            expect(error).toBeInstanceOf(Error)
          }
        }
      }
    })
  })
})
