const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

module.exports = (request, options) => {
  const basedir = options.basedir || process.cwd()

  if (request.startsWith('.') && !basedir.includes('node_modules')) {
    if (request.endsWith('.js')) {
      const candidate = path.resolve(
        basedir,
        request.replace(/\.js$/, '.ts')
      )
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } else if (path.extname(request) === '') {
      const candidate = path.resolve(basedir, `${request}.ts`)
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  const requireFrom = createRequire(path.join(basedir, '__resolver__.js'))
  return requireFrom.resolve(request)
}
