#!/usr/bin/env node

/**
 * Post-install script for @nodots-llc/backgammon-ai
 * 
 * This script runs after npm install to ensure gnubg is properly set up.
 * It handles both development and production environments.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function checkGnubgBinary() {
  const gnubgPath = path.join(__dirname, '..', 'gnubg', 'gnubg')
  
  if (fs.existsSync(gnubgPath)) {
    try {
      // Check if it's executable
      fs.accessSync(gnubgPath, fs.constants.X_OK)
      log('✅ gnubg binary found and is executable', colors.green)
      return true
    } catch {
      // Try to make it executable
      try {
        fs.chmodSync(gnubgPath, '755')
        log('✅ Made gnubg binary executable', colors.green)
        return true
      } catch (err) {
        log(`⚠️  gnubg binary exists but couldn't make it executable: ${err.message}`, colors.yellow)
        return false
      }
    }
  }
  
  return false
}

function checkDataFiles() {
  const dataFiles = [
    'gnubg.wd',
    'gnubg.weights',
    'gnubg_os0.bd',
    'gnubg_ts0.bd'
  ]
  
  const gnubgDir = path.join(__dirname, '..', 'gnubg')
  let allFilesPresent = true
  
  for (const file of dataFiles) {
    const filePath = path.join(gnubgDir, file)
    if (!fs.existsSync(filePath)) {
      log(`⚠️  Missing data file: ${file}`, colors.yellow)
      allFilesPresent = false
    }
  }
  
  if (allFilesPresent) {
    log('✅ All gnubg data files present', colors.green)
  }
  
  return allFilesPresent
}

function main() {
  // Skip in CI environments or when explicitly disabled
  if (process.env.CI || process.env.SKIP_GNUBG_SETUP) {
    log('ℹ️  Skipping gnubg setup (CI or SKIP_GNUBG_SETUP)', colors.blue)
    return
  }
  
  log('\n🎲 Checking GNU Backgammon setup for @nodots-llc/backgammon-ai', colors.blue)
  log('='.repeat(60), colors.blue)
  
  const binaryOk = checkGnubgBinary()
  const dataOk = checkDataFiles()
  
  if (!binaryOk) {
    log('\n⚠️  gnubg binary not found or not executable', colors.yellow)
    log('Run "npm run setup-gnubg" to build gnubg from source', colors.yellow)
    log('Or install gnubg system-wide with your package manager', colors.yellow)
  }
  
  if (!dataOk) {
    log('\n⚠️  Some gnubg data files are missing', colors.yellow)
    log('The AI may not function correctly without all data files', colors.yellow)
  }
  
  if (binaryOk && dataOk) {
    log('\n✅ GNU Backgammon is properly configured!', colors.green)
  } else {
    log('\n⚠️  GNU Backgammon setup incomplete', colors.yellow)
    log('The package will fall back to system gnubg if available', colors.yellow)
  }
}

// Only run if called directly (not during development npm install)
if (require.main === module) {
  main()
}