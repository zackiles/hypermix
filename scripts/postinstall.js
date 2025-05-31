#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execSync } = require('node:child_process')
const os = require('node:os')

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
    console.log(`Downloading from: ${url}`)
    const file = fs.createWriteStream(destPath)
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location
        console.log(`Redirecting to: ${redirectUrl}`)
        file.close()
        fs.unlinkSync(destPath)
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject)
        return
      }
      
      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(destPath)
        reject(new Error(`Failed to download: Status ${response.statusCode}, URL: ${url}`))
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

async function extractArchive(archivePath, targetDir, isZip) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hypermix-'))
  try {
    if (isZip) {
      if (process.platform === 'win32') {
        // Windows - use PowerShell
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpDir}' -Force"`)
      } else {
        // Unix - use unzip
        execSync(`unzip -o "${archivePath}" -d "${tmpDir}"`)
      }
    } else {
      // Use tar for .tar.gz
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`)
    }
    
    // Find the binary in the extracted files
    const isWindows = process.platform === 'win32'
    const binaryPattern = `${APP_NAME}-*${isWindows ? '.exe' : ''}`
    let binaryFiles
    
    if (isWindows) {
      // Windows
      const output = execSync(`dir /b "${tmpDir}" | findstr "${binaryPattern}"`, { encoding: 'utf8' })
      binaryFiles = output.trim().split('\r\n')
    } else {
      // Unix
      const output = execSync(`find "${tmpDir}" -name "${binaryPattern}" -type f`, { encoding: 'utf8' })
      binaryFiles = output.trim().split('\n')
    }
    
    // Filter out empty entries
    binaryFiles = binaryFiles.filter(file => file.trim().length > 0)
    
    if (binaryFiles.length === 0) {
      throw new Error('No binary found in the archive')
    }
    
    // Get the full path of the binary
    const binaryPath = isWindows 
      ? path.join(tmpDir, binaryFiles[0])
      : binaryFiles[0]
    
    // Copy the binary to the target directory
    fs.copyFileSync(binaryPath, path.join(targetDir, path.basename(binaryPath)))
    
    // Make binary executable on Unix-like systems
    if (!isWindows) {
      fs.chmodSync(path.join(targetDir, path.basename(binaryPath)), 0o755)
    }
  } finally {
    // Clean up
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to clean up temp directory: ${error.message}`)
    }
  }
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
  
  // Array of potential URLs to try
  const downloadOptions = []
  
  // 1. Try the target-specific binary
  const targetArchiveExt = isWindows ? '.zip' : '.tar.gz'
  const targetArchiveName = `${binaryName}${targetArchiveExt}`
  
  // 2. Try platform-specific simplified name
  const platformNameMap = {
    'win32': 'windows',
    'darwin': 'macos',
    'linux': 'linux'
  }
  const simplePlatform = platformNameMap[platform] || platform
  const simpleArch = arch === 'arm64' ? '-arm' : ''
  const simpleBinaryName = `${APP_NAME}-${simplePlatform}${simpleArch}${isWindows ? '.exe' : ''}`
  const simpleArchiveName = `${simpleBinaryName}${targetArchiveExt}`
  
  // Add URLs to try in order
  downloadOptions.push({
    url: `https://github.com/zackiles/hypermix/releases/download/v${version}/${targetArchiveName}`,
    name: targetArchiveName
  })
  
  downloadOptions.push({
    url: `https://github.com/zackiles/hypermix/releases/download/v${version}/${simpleArchiveName}`,
    name: simpleArchiveName
  })
  
  // Try downloading from each URL
  let success = false
  let lastError = null
  
  for (const option of downloadOptions) {
    const archivePath = path.join(os.tmpdir(), option.name)
    
    console.log(`Attempting to download ${APP_NAME} archive from ${option.url}...`)
    
    try {
      await downloadFile(option.url, archivePath)
      console.log(`Downloaded archive to ${archivePath}`)
      
      // Extract the archive
      console.log('Extracting binary...')
      const isZip = option.name.endsWith('.zip')
      await extractArchive(archivePath, binDir, isZip)
      
      // Check if we got the expected binary
      if (fs.existsSync(binaryPath)) {
        console.log(`Successfully installed binary to ${binaryPath}`)
        
        // Cleanup
        fs.unlinkSync(archivePath)
        success = true
        break
      } else {
        // Check if we got a platform-specific binary instead
        const altBinaryPath = path.join(binDir, simpleBinaryName)
        if (fs.existsSync(altBinaryPath)) {
          console.log(`Found alternative binary at ${altBinaryPath}`)
          // Copy it to the expected location
          fs.copyFileSync(altBinaryPath, binaryPath)
          console.log(`Copied to expected location: ${binaryPath}`)
          success = true
          break
        } else {
          console.log('Binary extraction failed. Files in bin directory:')
          const files = fs.readdirSync(binDir)
          console.log(files.join(', ') || 'No files found')
          throw new Error('Binary not found after extraction')
        }
      }
    } catch (error) {
      console.error(`Failed to download or extract from ${option.url}:`, error.message)
      lastError = error
      // Continue to next option
    }
  }
  
  if (!success) {
    console.error('All download attempts failed.')
    console.error('\nYou can manually download the binary from:')
    console.error(`https://github.com/zackiles/hypermix/releases/tag/v${version}`)
    if (lastError) {
      console.error('\nLast error:', lastError.message)
    }
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
