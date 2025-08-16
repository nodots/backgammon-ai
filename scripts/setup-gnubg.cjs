#!/usr/bin/env node

/**
 * GNU Backgammon Setup Script
 *
 * This script helps users configure and build the included gnubg source code.
 * It provides platform-specific instructions and handles common setup tasks.
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function error(message) {
  log(`❌ ${message}`, colors.red)
}

function success(message) {
  log(`✅ ${message}`, colors.green)
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue)
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow)
}

/**
 * Check if a command exists in PATH
 */
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Get platform-specific dependency installation instructions
 */
function getDependencyInstructions() {
  const platform = os.platform()

  switch (platform) {
    case 'darwin': // macOS
      return {
        name: 'macOS',
        packageManager: 'Homebrew',
        installCommand:
          'brew install autoconf automake libtool pkg-config glib readline sqlite',
        setupInstructions: [
          'Install Homebrew if not already installed:',
          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        ],
      }

    case 'linux':
      // Try to detect Linux distribution
      try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8')
        if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
          return {
            name: 'Ubuntu/Debian',
            packageManager: 'apt',
            installCommand:
              'sudo apt-get update && sudo apt-get install build-essential autoconf automake libtool pkg-config libglib2.0-dev libreadline-dev libsqlite3-dev',
            setupInstructions: [],
          }
        } else if (
          osRelease.includes('CentOS') ||
          osRelease.includes('Red Hat') ||
          osRelease.includes('Fedora')
        ) {
          return {
            name: 'Red Hat/CentOS/Fedora',
            packageManager: 'yum/dnf',
            installCommand:
              'sudo yum install -y autoconf automake libtool pkgconfig glib2-devel readline-devel sqlite-devel gcc make',
            setupInstructions: [],
          }
        }
      } catch {
        // Fallback
      }

      return {
        name: 'Linux',
        packageManager: 'package manager',
        installCommand:
          'Install: build-essential autoconf automake libtool pkg-config libglib2.0-dev libreadline-dev',
        setupInstructions: [
          "Use your distribution's package manager to install the dependencies above",
        ],
      }

    default:
      return {
        name: platform,
        packageManager: 'system package manager',
        installCommand: 'Install required development tools and libraries',
        setupInstructions: [
          'Please refer to your system documentation for installing development dependencies',
        ],
      }
  }
}

/**
 * Check required dependencies
 */
function checkDependencies() {
  const required = ['autoconf', 'automake', 'libtool', 'make', 'pkg-config']
  const optional = ['gcc', 'clang', 'python3']

  info('Checking required dependencies...')

  const missing = []
  for (const dep of required) {
    if (commandExists(dep)) {
      success(`${dep} ✓`)
    } else {
      error(`${dep} ✗`)
      missing.push(dep)
    }
  }

  info('Checking optional dependencies...')
  for (const dep of optional) {
    if (commandExists(dep)) {
      success(`${dep} ✓`)
    } else {
      warning(`${dep} ✗ (optional)`)
    }
  }

  return missing
}

/**
 * Configure gnubg
 */
async function configureGnubg() {
  const gnubgDir = path.join(process.cwd(), 'gnubg')

  if (!fs.existsSync(gnubgDir)) {
    error('gnubg directory not found')
    return false
  }

  info('Configuring gnubg...')

  try {
    process.chdir(gnubgDir)

    // Make autogen.sh executable if it exists
    const autogenPath = path.join(gnubgDir, 'autogen.sh')
    if (fs.existsSync(autogenPath)) {
      fs.chmodSync(autogenPath, '755')
    }

    // Minimal configuration - only what's needed for command-line operation
    const configureArgs = [
      '--enable-simd=yes',
      '--disable-gtk', // Disable GTK GUI
      '--disable-cputest', // Disable CPU testing
      '--without-board3d', // Disable 3D board
      '--without-python', // Disable Python (optional, can enable if needed)
    ]

    const configureCommand = `./configure ${configureArgs.join(' ')}`
    info(`Running: ${configureCommand}`)

    execSync(configureCommand, { stdio: 'inherit' })
    success('gnubg configured successfully')
    return true
  } catch (err) {
    error(`Failed to configure gnubg: ${err.message}`)
    return false
  } finally {
    process.chdir('..')
  }
}

/**
 * Build gnubg
 */
async function buildGnubg() {
  const gnubgDir = path.join(process.cwd(), 'gnubg')

  if (!fs.existsSync(gnubgDir)) {
    error('gnubg directory not found')
    return false
  }

  info('Building gnubg...')

  try {
    process.chdir(gnubgDir)

    const buildCommand = 'make'
    info(`Running: ${buildCommand}`)

    execSync(buildCommand, { stdio: 'inherit' })
    success('gnubg built successfully')
    return true
  } catch (err) {
    error(`Failed to build gnubg: ${err.message}`)
    return false
  } finally {
    process.chdir('..')
  }
}

/**
 * Main setup function
 */
async function main() {
  log('🎲 GNU Backgammon Setup for nodots-backgammon-ai', colors.cyan)
  log('='.repeat(50), colors.cyan)

  const deps = getDependencyInstructions()

  log(`\nDetected platform: ${deps.name}`, colors.magenta)

  // Check dependencies
  const missing = checkDependencies()

  if (missing.length > 0) {
    warning(`\nMissing dependencies: ${missing.join(', ')}`)
    log(`\nTo install dependencies on ${deps.name}:`, colors.yellow)

    if (deps.setupInstructions.length > 0) {
      for (const instruction of deps.setupInstructions) {
        log(`  ${instruction}`, colors.yellow)
      }
    }

    log(`  ${deps.installCommand}`, colors.yellow)
    log(
      '\nPlease install the missing dependencies and run this script again.',
      colors.yellow
    )
    process.exit(1)
  }

  success('\nAll required dependencies found!')

  // Get command line arguments
  const args = process.argv.slice(2)
  const configOnly = args.includes('--configure-only')
  const buildOnly = args.includes('--build-only')

  if (buildOnly) {
    // Just build
    const success = await buildGnubg()
    process.exit(success ? 0 : 1)
  } else if (configOnly) {
    // Just configure
    const success = await configureGnubg()
    process.exit(success ? 0 : 1)
  } else {
    // Configure and build
    const configSuccess = await configureGnubg()
    if (!configSuccess) {
      process.exit(1)
    }

    const buildSuccess = await buildGnubg()
    if (!buildSuccess) {
      process.exit(1)
    }

    success('\n🎉 gnubg setup complete!')
    info('\nYou can now use gnubg in your nodots-backgammon-ai project.')
    info('Try running: npm test to verify the integration works.')
  }
}

// Handle command line usage
if (require.main === module) {
  main().catch((error) => {
    console.error('Setup failed:', error)
    process.exit(1)
  })
}

module.exports = { main, configureGnubg, buildGnubg, checkDependencies }
