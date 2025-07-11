// Entry point for nodots-backgammon-ai
import { exec } from 'child_process'
import { BackgammonMoveBase } from '../../nodots-backgammon-types/src/move'
import { gnubg, GnubgIntegration } from './gnubg'
import { MoveAnalyzer, RandomMoveAnalyzer } from './moveAnalyzers'

/**
 * Parses the output from gnubg 'hint' command to extract the best move string.
 * Assumes the best move is on the line starting with '1. ' and contains a move like '8/4 6/4'.
 * @param hintOutput The raw output from gnubg.
 * @returns The best move string, or null if not found.
 */
function parseBestMoveFromHint(hintOutput: string): string | null {
  const lines = hintOutput.split('\n')
  for (const line of lines) {
    const match = line.match(
      /^\s*1\.\s+[^\s]+\s+[^\s]+\s+((?:[a-zA-Z0-9*]+\/[a-zA-Z0-9*]+(?:\*|)?\s*)+)/
    )
    if (match) {
      return match[1].trim()
    }
  }
  // Fallback: look for "gnubg moves ..." line
  for (const line of lines) {
    const match = line.match(/gnubg moves ([\w/* ]+)\./i)
    if (match) {
      return match[1].trim()
    }
  }
  return null
}

/**
 * Calls GNU Backgammon to get the best move for a given position ID.
 * Uses the new GnubgIntegration class which automatically detects local builds.
 *
 * @param positionId The GNU Backgammon Position ID.
 * @returns A promise that resolves with the best move string (e.g., '8/4 6/4').
 * @throws Error if gnubg execution fails or if the best move cannot be parsed.
 */
export async function getGnubgMoveHint(positionId: string): Promise<string> {
  try {
    // Use the new gnubg integration
    const bestMove = await gnubg.getBestMove(positionId)
    console.log('Best move from gnubg:', bestMove)
    return bestMove
  } catch (error) {
    // Check if gnubg is available and provide helpful error message
    const isAvailable = await gnubg.isAvailable()
    if (!isAvailable) {
      const instructions = gnubg.getBuildInstructions()
      throw new Error(`GNU Backgammon is not available.\n\n${instructions}`)
    }

    // Re-throw original error if gnubg is available but command failed
    throw error
  }
}

/**
 * Legacy function - calls GNU Backgammon using direct command execution.
 * This is kept for backwards compatibility but the new getGnubgMoveHint is preferred.
 *
 * @param positionId The GNU Backgammon Position ID.
 * @returns A promise that resolves with the best move string (e.g., '8/4 6/4').
 * @throws Error if gnubg execution fails or if the best move cannot be parsed.
 */
export async function getGnubgMoveHintLegacy(
  positionId: string
): Promise<string> {
  const commands = `new game\nset board ${positionId}\nhint`

  return new Promise((resolve, reject) => {
    const gnubgCommand =
      process.platform === 'win32' ? 'gnubg-cli.exe' : 'gnubg -t'
    // Pipe commands to gnubg via stdin
    exec(`echo "${commands}" | ${gnubgCommand}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing gnubg: ${error.message}`)
        console.error(`gnubg stderr: ${stderr}`)
        reject(new Error(`Failed to execute gnubg. ${stderr || error.message}`))
        return
      }
      // Log the actual gnubg output for debugging
      console.log(
        '\n--- GNU BG Output ---\n' +
          stdout +
          '\n--- End of GNU BG Output ---\n'
      )
      const bestMove = parseBestMoveFromHint(stdout)
      if (!bestMove) {
        reject(new Error('Could not parse best move from gnubg output.'))
        return
      }
      console.log('Best move:', bestMove)
      resolve(bestMove)
    })
  })
}

/**
 * Gets the best move for the standard starting position.
 * @returns A promise that resolves with the best move string.
 */
export async function getBestMoveForStartingPosition(): Promise<string> {
  const startingPositionId = '4HPwATDgc/ABMA' // Standard starting position
  return getGnubgMoveHint(startingPositionId)
}

/**
 * Selects a move from a list using the specified analyzer (defaults to random).
 * @param moves List of BackgammonMoveBase
 * @param analyzer Optional MoveAnalyzer (defaults to RandomMoveAnalyzer)
 * @returns The selected move, or null if the list is empty
 */
export async function selectMoveFromList(
  moves: BackgammonMoveBase[],
  analyzer?: MoveAnalyzer
): Promise<BackgammonMoveBase | null> {
  const moveAnalyzer = analyzer || new RandomMoveAnalyzer()
  return moveAnalyzer.selectMove(moves)
}

/**
 * Get information about the available gnubg installation
 * @returns Object with gnubg availability and version info
 */
export async function getGnubgInfo(): Promise<{
  available: boolean
  path: string | null
  version?: string
  hasLocalBuild: boolean
}> {
  const available = await gnubg.isAvailable()
  const path = await gnubg.getGnubgPath()
  const hasLocalBuild = await gnubg.hasLocalBuild()

  let version: string | undefined
  if (available) {
    try {
      version = await gnubg.getVersion()
    } catch {
      version = 'Unknown'
    }
  }

  return {
    available,
    path,
    version,
    hasLocalBuild,
  }
}

// Re-export for convenience
export * from './gnubgApi'
export * from './moveAnalyzers'
export * from './pluginLoader'
export { gnubg, GnubgIntegration }

// Export AI plugins
export { GnubgMoveAnalyzer } from '../plugins/gnubgMoveAnalyzer'
export { NodotsAIMoveAnalyzer } from '../plugins/nodotsAIMoveAnalyzer'

// Example usage (assuming you have a Position ID from nodots-backgammon-core):
// async function main() {
//   // Replace with a real Position ID from your game
//   const examplePositionId = "4HPwATDgc/ABMA"; // Standard starting position
//   console.log(\`Requesting hint for position: \${examplePositionId}\`);
//
//   try {
//     const hintOutput = await getGnubgMoveHint(examplePositionId);
//     console.log("\\n--- GNU BG Hint Output ---");
//     console.log(hintOutput);
//     console.log("--- End of GNU BG Hint Output ---");
//
//     // TODO: Implement parsing for hintOutput to extract the top-ranked move.
//     // The output format for the 'hint' command needs to be understood to parse it correctly.
//     // It typically lists possible moves with their equities and other stats.
//     // For example, you might look for the line starting with "1. Cubeful 0-ply ..."
//     // and extract the move description (e.g., "8/4 6/4").
//     console.log("\\nNext step: Parse the output above to find the best move.");
//
//   } catch (error) {
//     console.error("Error getting GNU BG hint:", error);
//   }
// }
//
// main();
