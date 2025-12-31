import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { MoveAnalyzer } from './moveAnalyzers.js'

export async function loadAnalyzersFromPluginsDir(
  pluginsDir: string
): Promise<Record<string, MoveAnalyzer>> {
  const analyzers: Record<string, MoveAnalyzer> = {}
  const files = fs.readdirSync(pluginsDir)
  for (const file of files) {
    if (
      file.endsWith('.js') ||
      file.endsWith('.ts') ||
      file.endsWith('.mjs') ||
      file.endsWith('.cjs')
    ) {
      const pluginPath = path.join(pluginsDir, file)
      const moduleUrl = pathToFileURL(pluginPath).href
      const mod = await import(moduleUrl)
      const PluginClass = mod.default ?? mod
      if (PluginClass) {
        const name = path.basename(file, path.extname(file))
        analyzers[name] = new PluginClass()
      }
    }
  }
  return analyzers
}

// Usage example:
// const analyzers = await loadAnalyzersFromPluginsDir(path.join(__dirname, '../plugins'))
// const move = await analyzers['myCustomAnalyzer'].selectMove(moves, context)
