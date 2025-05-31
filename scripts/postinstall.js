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
    
    const makeRequest = (requestUrl, redirectCount = 0) => {
      // Prevent infinite redirects
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'))
        return
      }
      
      const file = fs.createWriteStream(destPath)
      
      const request = https.get(requestUrl, { timeout: 30000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          console.log(`Redirecting to: ${redirectUrl}`)
          file.close()
          
          // Clean up the file before retrying
          try {
            fs.unlinkSync(destPath)
          } catch (err) {
            // File might not exist, ignore
          }
          
          // Follow the redirect
          makeRequest(redirectUrl, redirectCount + 1)
          return
        }
        
        if (response.statusCode !== 200) {
          file.close()
          try {
            fs.unlinkSync(destPath)
          } catch (err) {
            // File might not exist, ignore
          }
          reject(new Error(`Failed to download: Status ${response.statusCode}, URL: ${requestUrl}`))
          return
        }
        
        response.pipe(file)
        
        file.on('finish', () => {
          file.close()
          
          // Validate the downloaded file
          try {
            if (!fs.existsSync(destPath)) {
              reject(new Error('Downloaded file does not exist'))
              return
            }
            
            const stats = fs.statSync(destPath)
            if (stats.size === 0) {
              reject(new Error('Downloaded file is empty'))
              return
            }
            
            // Check if it's an HTML error page
            const fileStart = fs.readFileSync(destPath, { encoding: 'utf8', length: 200 })
            if (fileStart.includes('<html') || fileStart.includes('<!DOCTYPE') || fileStart.includes('<title>')) {
              reject(new Error('Downloaded file appears to be an HTML error page'))
              return
            }
            
            // Validate gzip format for .tar.gz files
            if (destPath.endsWith('.tar.gz')) {
              const buffer = fs.readFileSync(destPath, { length: 2 })
              if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
                reject(new Error('Downloaded file is not a valid gzip archive'))
                return
              }
            }
            
            console.log(`Downloaded and validated: ${stats.size} bytes`)
            resolve()
          } catch (validationError) {
            // Clean up invalid file
            try {
              fs.unlinkSync(destPath)
            } catch (cleanupErr) {
              // Ignore cleanup errors
            }
            reject(new Error(`File validation failed: ${validationError.message}`))
          }
        })
        
        file.on('error', (err) => {
          file.close()
          try {
            fs.unlinkSync(destPath)
          } catch (unlinkErr) {
            // File might not exist, ignore
          }
          reject(err)
        })
        
      }).on('error', (err) => {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch (unlinkErr) {
          // File might not exist, ignore
        }
        reject(err)
      }).on('timeout', () => {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch (unlinkErr) {
          // File might not exist, ignore
        }
        reject(new Error(`Download timeout for URL: ${requestUrl}`))
      })
      
      request.setTimeout(30000)
    }
    
    makeRequest(url)
  })
}

async function downloadFileWithCurl(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Trying curl download from: ${url}`)
    
    // Try curl first, then wget as fallback
    const commands = [
      `curl -L -w "%{http_code}" -o "${destPath}" "${url}"`,
      `wget --server-response -O "${destPath}" "${url}" 2>&1 | grep "HTTP/" | tail -1`
    ]
    
    let lastError = null
    
    const tryCommand = (index) => {
      if (index >= commands.length) {
        reject(lastError || new Error('All download methods failed'))
        return
      }
      
      const command = commands[index]
      const isCurl = command.includes('curl')
      console.log(`Trying: ${isCurl ? 'curl' : 'wget'} download`)
      
      try {
        const result = execSync(command, { encoding: 'utf8', timeout: 60000 })
        
        // Validate the download
        if (!fs.existsSync(destPath)) {
          throw new Error('Downloaded file does not exist')
        }
        
        const stats = fs.statSync(destPath)
        if (stats.size === 0) {
          throw new Error('Downloaded file is empty')
        }
        
        // Check if it's an HTML error page (common for 404s)
        const fileStart = fs.readFileSync(destPath, { encoding: 'utf8', length: 100 })
        if (fileStart.includes('<html') || fileStart.includes('<!DOCTYPE')) {
          throw new Error('Downloaded file appears to be an HTML error page')
        }
        
        // For curl, check the HTTP status code
        if (isCurl) {
          const httpCode = result.trim()
          const statusCode = Number.parseInt(httpCode.slice(-3)) // Get last 3 characters
          if (statusCode >= 400) {
            throw new Error(`HTTP ${statusCode} error`)
          }
          console.log(`HTTP status: ${statusCode}`)
        }
        
        // Validate file format for tar.gz files
        if (destPath.endsWith('.tar.gz')) {
          try {
            // Test if it's a valid gzip file by reading the magic bytes
            const buffer = fs.readFileSync(destPath, { length: 2 })
            if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
              throw new Error('File is not a valid gzip archive')
            }
          } catch (readError) {
            throw new Error(`Invalid gzip file: ${readError.message}`)
          }
        }
        
        console.log(`Successfully downloaded and validated with ${isCurl ? 'curl' : 'wget'} (${stats.size} bytes)`)
        resolve()
        
      } catch (error) {
        console.log(`${isCurl ? 'curl' : 'wget'} failed: ${error.message}`)
        lastError = error
        
        // Clean up the invalid file
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath)
          }
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        
        tryCommand(index + 1)
      }
    }
    
    tryCommand(0)
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
  
  console.log(`Starting postinstall for platform: ${platformKey}`)
  
  // Create bin directory first, before any other operations
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    console.log('Creating bin directory...')
    fs.mkdirSync(binDir, { recursive: true })
  }
  
  const target = TARGET_MAP[platformKey]
  if (!target) {
    console.error(`Unsupported platform: ${platformKey}`)
    console.error('Supported platforms:', Object.keys(TARGET_MAP).join(', '))
    process.exit(1)
  }
  
  const isWindows = platform === 'win32'
  const binaryName = `${APP_NAME}-${target}${isWindows ? '.exe' : ''}`
  const binaryPath = path.join(binDir, binaryName)
  
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
    
    // Try https method first, then curl as fallback
    const downloadMethods = [
      () => downloadFile(option.url, archivePath),
      () => downloadFileWithCurl(option.url, archivePath)
    ]
    
    let downloaded = false
    
    for (const downloadMethod of downloadMethods) {
      try {
        await downloadMethod()
        console.log(`Downloaded archive to ${archivePath}`)
        downloaded = true
        break
      } catch (error) {
        console.error(`Download method failed: ${error.message}`)
        lastError = error
        // Clean up any partial download
        try {
          if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath)
          }
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
      }
    }
    
    if (!downloaded) {
      console.error(`All download methods failed for ${option.url}`)
      continue
    }
    
    try {
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
      console.error(`Failed to extract from ${option.url}:`, error.message)
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
