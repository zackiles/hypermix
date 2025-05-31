#!/usr/bin/env node

const path = require('node:path')
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const APP_NAME = 'hypermix'

// Map Node.js platform/arch to binary targets
const TARGET_MAP = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

function main() {
  const platform = process.platform
  const arch = process.arch
  const platformKey = `${platform}-${arch}`
  
  const target = TARGET_MAP[platformKey]
  if (!target) {
    console.error(`Unsupported platform: ${platformKey}`)
    console.error('Supported platforms:', Object.keys(TARGET_MAP).join(', '))
    process.exit(1)
  }
  
  const isWindows = platform === 'win32'
  const binaryName = `${APP_NAME}-${target}${isWindows ? '.exe' : ''}`
  const binaryPath = path.join(__dirname, '..', 'bin', binaryName)
  
  // Check if binary exists
  if (!fs.existsSync(binaryPath)) {
    console.error(`Binary not found at ${binaryPath}`)
    
    // Debug information
    console.error('Debug info:')
    console.error('- __dirname:', __dirname)
    console.error('- Looking for binary:', binaryName)
    
    try {
      const binDir = path.join(__dirname, '..', 'bin')
      if (fs.existsSync(binDir)) {
        const files = fs.readdirSync(binDir)
        console.error('- Files in bin directory:', files.join(', ') || 'No files found')
      } else {
        console.error('- bin directory does not exist')
      }
    } catch (err) {
      console.error('- Error listing bin directory:', err.message)
    }
    
    // Try alternative binary names
    const platformBinary = `${APP_NAME}-${platform}${isWindows ? '.exe' : ''}`
    const platformBinaryPath = path.join(__dirname, '..', 'bin', platformBinary)
    
    if (fs.existsSync(platformBinaryPath)) {
      console.error(`Using alternative binary: ${platformBinary}`)
      runBinary(platformBinaryPath, process.argv.slice(2))
      return
    }
    
    console.error('Please run: npm install')
    process.exit(1)
  }
  
  runBinary(binaryPath, process.argv.slice(2))
}

function runBinary(binaryPath, args) {
  // Spawn the binary with inherited stdio
  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    windowsHide: false
  })
  
  // Forward the exit code
  child.on('close', (code) => {
    process.exit(code || 0)
  })
  
  // Handle errors
  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error(`Binary not found: ${binaryPath}`)
      console.error('Please run: npm install')
    } else if (err.code === 'EACCES') {
      console.error(`Binary is not executable: ${binaryPath}`)
      console.error('Please check file permissions')
      
      if (process.platform !== 'win32') {
        console.error('Attempting to fix permissions...')
        try {
          fs.chmodSync(binaryPath, 0o755)
          console.error('Permissions fixed, retrying...')
          runBinary(binaryPath, args)
          return
        } catch (chmodErr) {
          console.error('Failed to fix permissions:', chmodErr.message)
        }
      }
    } else {
      console.error('Failed to start binary:', err.message)
    }
    process.exit(1)
  })
}

// Run the launcher
if (require.main === module) {
  main()
} 
