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
    console.error('Please run: npm install')
    process.exit(1)
  }
  
  // Get command line arguments (skip node and script path)
  const args = process.argv.slice(2)
  
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
