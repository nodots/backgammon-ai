#!/usr/bin/env node

/**
 * Copy gnubg binary and data files to dist directory
 * This ensures the gnubg binary is available when the package is published
 */

const fs = require('fs')
const path = require('path')

const sourceDir = path.join(__dirname, '..', 'gnubg')
const targetDir = path.join(__dirname, '..', 'dist', 'gnubg')

// Files to copy
const filesToCopy = [
  'gnubg',           // The binary
  'gnubg.wd',        // Word database
  'gnubg.weights',   // Neural network weights
  'gnubg_os0.bd',    // One-sided bearoff database
  'gnubg_ts0.bd',    // Two-sided bearoff database
]

function copyFile(source, target) {
  try {
    // Create target directory if it doesn't exist
    const targetDir = path.dirname(target)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    
    // Copy file
    fs.copyFileSync(source, target)
    
    // Preserve executable permissions for binary
    const stats = fs.statSync(source)
    fs.chmodSync(target, stats.mode)
    
    return true
  } catch (err) {
    console.error(`Failed to copy ${source}: ${err.message}`)
    return false
  }
}

function main() {
  console.log('📋 Copying gnubg files to dist directory...')
  
  let success = true
  let copiedCount = 0
  
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file)
    const targetPath = path.join(targetDir, file)
    
    if (fs.existsSync(sourcePath)) {
      if (copyFile(sourcePath, targetPath)) {
        console.log(`✅ Copied ${file}`)
        copiedCount++
      } else {
        console.log(`❌ Failed to copy ${file}`)
        success = false
      }
    } else {
      console.log(`⚠️  ${file} not found in gnubg directory`)
      if (file === 'gnubg') {
        // Binary is critical
        success = false
      }
    }
  }
  
  if (success && copiedCount > 0) {
    console.log(`\n✅ Successfully copied ${copiedCount} file(s) to dist/gnubg`)
  } else if (copiedCount === 0) {
    console.log('\n⚠️  No gnubg files found to copy')
    console.log('Run "npm run setup-gnubg" to build gnubg first')
  } else {
    console.log('\n⚠️  Some files could not be copied')
  }
  
  process.exit(success ? 0 : 1)
}

if (require.main === module) {
  main()
}