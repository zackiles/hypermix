#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execSync } = require('node:child_process')

const APP_NAME = 'hypermix'

// Map Node.js platform/arch to binary targets
const TARGET_MAP = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close()
        fs.unlinkSync(destPath)
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject)
        return
      }
      
      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(destPath)
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }
      
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      fs.unlinkSync(destPath)
      reject(err)
    })
  })
}

async function main() {
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
  const binDir = path.join(__dirname, '..', 'bin')
  const binaryPath = path.join(binDir, binaryName)
  
  // Create bin directory if it doesn't exist
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }
  
  // Check if binary already exists
  if (fs.existsSync(binaryPath)) {
    console.log(`Binary already exists at ${binaryPath}`)
    return
  }
  
  // Get package version
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const version = packageJson.version
  
  // Download binary from GitHub releases
  const downloadUrl = `https://github.com/zackiles/hypermix/releases/download/v${version}/${binaryName}`
  console.log(`Downloading ${APP_NAME} binary for ${platformKey}...`)
  console.log(`URL: ${downloadUrl}`)
  
  try {
    await downloadFile(downloadUrl, binaryPath)
    console.log(`Downloaded binary to ${binaryPath}`)
    
    // Make binary executable on Unix-like systems
    if (!isWindows) {
      fs.chmodSync(binaryPath, 0o755)
      console.log('Made binary executable')
    }
  } catch (error) {
    console.error('Failed to download binary:', error.message)
    console.error('\nYou can manually download the binary from:')
    console.error(`https://github.com/zackiles/hypermix/releases/tag/v${version}`)
    process.exit(1)
  }
}

// Run postinstall
if (require.main === module) {
  main().catch((error) => {
    console.error('Postinstall failed:', error)
    process.exit(1)
  })
} 
