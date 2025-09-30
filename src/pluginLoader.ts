import fs from 'fs'
import path from 'path'
import { MoveAnalyzer } from './moveAnalyzers.js'

export function loadAnalyzersFromPluginsDir(
  pluginsDir: string
): Record<string, MoveAnalyzer> {
  const analyzers: Record<string, MoveAnalyzer> = {}
  const files = fs.readdirSync(pluginsDir)
  for (const file of files) {
    if (file.endsWith('.js') || file.endsWith('.ts')) {
      const pluginPath = path.join(pluginsDir, file)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PluginClass = require(pluginPath).default
      if (PluginClass) {
        const name = path.basename(file, path.extname(file))
        analyzers[name] = new PluginClass()
      }
    }
  }
  return analyzers
}

// Usage example:
// const analyzers = loadAnalyzersFromPluginsDir(path.join(__dirname, '../plugins'))
// const move = await analyzers['myCustomAnalyzer'].selectMove(moves, context)
