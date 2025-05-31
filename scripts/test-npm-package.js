#!/usr/bin/env node

/**
 * Test script to verify that the npm package installation works correctly.
 * This script is run during the GitHub Actions workflow to ensure the hypermix
 * binary is properly installed and accessible.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const APP_NAME = 'hypermix'

// Map Node.js platform/arch to binary targets
const TARGET_MAP = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

// Platform-specific simple names
const PLATFORM_MAP = {
  'win32': 'windows',
  'darwin': 'macos',
  'linux': 'linux',
}

function main() {
  console.log('Testing npm package installation...')
  
  // Check that bin directory exists
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    console.error('❌ bin directory does not exist')
    process.exit(1)
  }
  
  // List all files in bin directory
  console.log('Files in bin directory:')
  const files = fs.readdirSync(binDir)
  for (const file of files) {
    console.log(`- ${file}`)
  }
  
  if (files.length === 0) {
    console.error('❌ No files found in bin directory')
    process.exit(1)
  }
  
  // Check for expected binary
  const platform = process.platform
  const arch = process.arch
  const platformKey = `${platform}-${arch}`
  const target = TARGET_MAP[platformKey]
  
  if (!target) {
    console.error(`❌ Unsupported platform: ${platformKey}`)
    process.exit(1)
  }
  
  const isWindows = platform === 'win32'
  const targetBinaryName = `${APP_NAME}-${target}${isWindows ? '.exe' : ''}`
  const targetBinaryPath = path.join(binDir, targetBinaryName)
  
  // Also check for platform-specific binary
  const simplePlatform = PLATFORM_MAP[platform] || platform
  const simpleArch = arch === 'arm64' ? '-arm' : ''
  const simpleBinaryName = `${APP_NAME}-${simplePlatform}${simpleArch}${isWindows ? '.exe' : ''}`
  const simpleBinaryPath = path.join(binDir, simpleBinaryName)
  
  let binaryPath = null
  
  // Check for target-specific binary
  if (fs.existsSync(targetBinaryPath)) {
    console.log(`✓ Found target-specific binary: ${targetBinaryName}`)
    binaryPath = targetBinaryPath
  } 
  // Check for platform-specific binary
  else if (fs.existsSync(simpleBinaryPath)) {
    console.log(`✓ Found platform-specific binary: ${simpleBinaryName}`)
    binaryPath = simpleBinaryPath
  } 
  // Check for any executable binary
  else {
    // Look for any executable that starts with the app name
    const binaryPattern = `${APP_NAME}-`
    const possibleBinary = files.find(file => file.startsWith(binaryPattern))
    
    if (possibleBinary) {
      binaryPath = path.join(binDir, possibleBinary)
      console.log(`✓ Found alternative binary: ${possibleBinary}`)
    } else {
      console.error('❌ No suitable binary found in bin directory')
      process.exit(1)
    }
  }
  
  // Check that the binary is executable
  try {
    // Make it executable on non-Windows platforms
    if (!isWindows) {
      fs.chmodSync(binaryPath, 0o755)
    }
    
    // Try to run the binary with --help or --version
    console.log('Testing binary execution...')
    let result = spawnSync(binaryPath, ['--help'], { encoding: 'utf8' })
    
    if (result.status !== 0) {
      // Try with --version instead
      result = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' })
    }
    
    if (result.status === 0) {
      console.log('✓ Binary executed successfully')
      console.log('✓ All tests passed!')
    } else {
      console.error('❌ Binary execution failed')
      console.error('Error output:', result.stderr)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error testing binary:', error.message)
    process.exit(1)
  }
}

// Run the test
if (require.main === module) {
  main()
}
