#!/usr/bin/env -S deno run --allow-all

/**
 * @module build
 * @description Builds a deno project into native binaries for all platforms
 *
 * This script uses the Deno compile command to create platform-specific binaries
 * and then compresses them into archives for distribution.
 *
 * @flags
 * --bin-path, -o - Specifies the output directory for compiled binaries and archives.
 *                   Defaults to 'bin' if not provided.
 *                   Example: deno run -A scripts/build.ts --bin-path=./dist
 *
 * --src-path - Specifies the entry point file to compile. If not provided, the script
 *              will auto-detect entry points by searching for mod.ts, main.ts, index.ts,
 *              or cli.ts in the current directory and src/ subdirectory.
 *              Example: deno run -A scripts/build.ts --src-path=custom/entry.ts
 *
 * --silent, -s - Suppresses all logging output. When enabled, the script runs silently
 *                except for errors that prevent execution.
 *                Example: deno run -A scripts/build.ts --silent
 */

import { join } from '@std/path'
import { toKebabCase } from '@std/text'
import { ensureDir, exists, expandGlob } from '@std/fs'
import { parseArgs } from '@std/cli'
import { parse } from '@std/jsonc'

// Global logger with silent mode support
let silentMode = false

const logger = {
  log: (...args: unknown[]) => {
    if (!silentMode) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (!silentMode) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    if (!silentMode) console.error(...args)
  },
}

// Get app name from deno config
let APP_NAME = 'app'
try {
  const configPath = join(Deno.cwd(), 'deno.json')
  const configPathJsonc = join(Deno.cwd(), 'deno.jsonc')
  let configContent: string | undefined

  try {
    configContent = await Deno.readTextFile(configPath)
  } catch {
    try {
      configContent = await Deno.readTextFile(configPathJsonc)
    } catch {
      // Neither file exists, use default
    }
  }

  if (configContent) {
    const config = parse(configContent) as { name: string }
    if (config.name) {
      // Extract short name by removing scope if it exists
      const shortName = config.name.split('/').pop() || config.name
      APP_NAME = toKebabCase(shortName)
    }
  }
} catch (error) {
  logger.warn('Failed to parse deno config for app name:', error)
}

// Define targets for cross-compilation
const TARGETS = [
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-pc-windows-msvc',
]

// Files to include in the distribution alongside the binary
const ADDITIONAL_FILES = [
  'LICENSE',
  'README.md',
]

// Platform mappings for creating "latest" files
const PLATFORM_MAPPINGS = {
  'linux': 'x86_64-unknown-linux-gnu',
  'linux-arm': 'aarch64-unknown-linux-gnu',
  'windows': 'x86_64-pc-windows-msvc',
  'macos': 'x86_64-apple-darwin',
  'macos-arm': 'aarch64-apple-darwin',
}

interface CompileOptions {
  binPath: string
  srcPath?: string
  silent: boolean
}

async function findEntryPoint(): Promise<string | null> {
  const entryPointNames = ['mod.ts', 'main.ts', 'index.ts', 'cli.ts']
  const searchPaths = ['.', 'src']

  for (const searchPath of searchPaths) {
    for (const entryName of entryPointNames) {
      const pattern = join(searchPath, entryName)
      try {
        for await (const entry of expandGlob(pattern, { includeDirs: false })) {
          // Return relative path from cwd
          const relativePath = entry.path.replace(`${Deno.cwd()}/`, '')
          return relativePath
        }
      } catch {
        // Continue searching if glob fails
      }
    }
  }

  return null
}

async function compress(files: string[], outputPath: string, isTarGz = false) {
  // For tar.gz, we need to use tar command
  if (isTarGz) {
    // Create a temporary directory
    const tempDir = await Deno.makeTempDir({ prefix: `${APP_NAME}-build-` })

    // Copy all files to temp directory
    for (const file of files) {
      const destFile = join(tempDir, file.split('/').pop() || '')
      await Deno.copyFile(file, destFile)
    }

    // Create tar.gz
    const tarArgs = ['-czf', outputPath, '-C', tempDir, '.']
    const tarCmd = new Deno.Command('tar', { args: tarArgs })
    const tarOutput = await tarCmd.output()

    if (!tarOutput.success) {
      const errorMsg = new TextDecoder().decode(tarOutput.stderr)
      throw new Error(`Failed to create tar.gz archive: ${errorMsg}`)
    }

    // Clean up temp directory
    await Deno.remove(tempDir, { recursive: true })
    return
  }

  // Create zip archive
  const isWindows = Deno.build.os === 'windows'
  const zipCommand = isWindows ? 'powershell' : 'zip'
  const zipArgs = isWindows
    ? [
      '-Command',
      `Compress-Archive -Path ${
        files.join(',')
      } -DestinationPath ${outputPath}`,
    ]
    : ['-j', outputPath, ...files]

  const cmd = new Deno.Command(zipCommand, { args: zipArgs })
  const output = await cmd.output()

  if (!output.success) {
    const errorMsg = new TextDecoder().decode(output.stderr)
    throw new Error(`Failed to create archive: ${errorMsg}`)
  }
}

async function compile({ binPath, srcPath, silent }: CompileOptions) {
  // Set global silent mode
  silentMode = silent

  // Ensure the output directory exists
  await ensureDir(binPath)

  let entryPoint: string

  if (srcPath) {
    entryPoint = join(Deno.cwd(), srcPath)
  } else {
    const foundEntryPoint = await findEntryPoint()
    if (!foundEntryPoint) {
      throw new Error(
        'No entry point found. Please specify --src-path or ensure you have one of: mod.ts, main.ts, index.ts, or cli.ts in your project root or src/ directory.',
      )
    }
    entryPoint = join(Deno.cwd(), foundEntryPoint)
    logger.log(
      `⚠️  No --src-path provided, using detected entry point: ${foundEntryPoint}`,
    )
  }

  const resources = ['deno.json']

  logger.log('Compiling binaries for all platforms...')

  for (const target of TARGETS) {
    const isWindowsTarget = target.includes('windows')
    const binaryName = `${APP_NAME}-${target}${isWindowsTarget ? '.exe' : ''}`
    const outputFile = join(binPath, binaryName)

    try {
      await Deno.remove(outputFile)
      logger.log(`Removed existing binary: ${outputFile}`)
    } catch (error: unknown) {
      // File doesn't exist, which is fine
      if (!(error instanceof Deno.errors.NotFound)) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error)
        logger.warn(`Warning when removing ${outputFile}: ${errorMessage}`)
      }
    }

    logger.log(`Compiling for ${target}...`)

    const compileArgs = [
      'compile',
      '--target',
      target,
      '--output',
      outputFile,
      '--allow-all',
      ...resources.flatMap((resource) => ['--include', resource]),
    ]

    // Add icon only for Windows builds if it exists
    if (isWindowsTarget) {
      const iconPath = join(Deno.cwd(), 'logo.ico')
      if (await exists(iconPath)) {
        compileArgs.push('--icon', iconPath)
      } else {
        logger.log(
          'Warning: logo.ico not found, skipping icon for Windows build',
        )
      }
    }

    // Add entry point at the end
    compileArgs.push(entryPoint)

    const cmd = new Deno.Command('deno', {
      args: compileArgs,
    })

    const output = await cmd.output()

    if (!output.success) {
      const errorMsg = new TextDecoder().decode(output.stderr)
      logger.error(`Failed to compile for ${target}: ${errorMsg}`)
      continue
    }

    logger.log(`Successfully compiled for ${target}: ${outputFile}`)

    const archivePath = `${outputFile}.zip`
    const tarGzPath = `${outputFile}.tar.gz`

    try {
      // Handle zip archive
      try {
        await Deno.remove(archivePath)
        logger.log(`Removed existing archive: ${archivePath}`)
      } catch (error: unknown) {
        if (!(error instanceof Deno.errors.NotFound)) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error)
          logger.warn(`Warning when removing ${archivePath}: ${errorMessage}`)
        }
      }

      // Compress the binary with additional files
      const filesToCompress = [outputFile, ...ADDITIONAL_FILES]
      await compress(filesToCompress, archivePath)
      logger.log(`Compressed binary and additional files to ${archivePath}`)

      // Also create tar.gz for Homebrew
      try {
        await Deno.remove(tarGzPath)
        logger.log(`Removed existing tar.gz: ${tarGzPath}`)
      } catch (error: unknown) {
        if (!(error instanceof Deno.errors.NotFound)) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error)
          logger.warn(`Warning when removing ${tarGzPath}: ${errorMessage}`)
        }
      }

      await compress(filesToCompress, tarGzPath, true)
      logger.log(`Created tar.gz archive at ${tarGzPath}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      logger.error(`Failed to compress files: ${errorMessage}`)
    }
  }

  // Create symlinks for the latest versions
  try {
    await createLatestSymlinks(binPath)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to create latest symlinks: ${errorMessage}`)
  }

  logger.log('Compilation complete!')
}

async function createLatestSymlinks(binPath: string) {
  for (const [platform, target] of Object.entries(PLATFORM_MAPPINGS)) {
    const isWindowsTarget = platform === 'windows'
    const originalBinary = `${APP_NAME}-${target}${
      isWindowsTarget ? '.exe' : ''
    }`
    const latestBinary = `${APP_NAME}-${platform}${
      isWindowsTarget ? '.exe' : ''
    }`
    const originalArchive = `${originalBinary}.zip`
    const latestArchive = `${latestBinary}.zip`
    const originalTarGz = `${originalBinary}.tar.gz`
    const latestTarGz = `${latestBinary}.tar.gz`

    // Create a copy of the latest binary and archive (symlinks may not work well cross-platform)
    const binarySource = join(binPath, originalBinary)
    const binaryDest = join(binPath, latestBinary)
    const archiveSource = join(binPath, originalArchive)
    const archiveDest = join(binPath, latestArchive)
    const tarGzSource = join(binPath, originalTarGz)
    const tarGzDest = join(binPath, latestTarGz)

    try {
      await Deno.copyFile(binarySource, binaryDest)
      await Deno.copyFile(archiveSource, archiveDest)
      await Deno.copyFile(tarGzSource, tarGzDest)
      logger.log(`Created latest copies for ${platform}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error)
      logger.warn(
        `Warning when creating latest copy for ${platform}: ${errorMessage}`,
      )
    }
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['bin-path', 'src-path'],
    boolean: ['silent'],
    default: {
      'bin-path': join(Deno.cwd(), 'bin'),
      'silent': false,
    },
    alias: {
      o: 'bin-path',
      s: 'silent',
    },
  })

  await compile({
    binPath: args['bin-path'],
    srcPath: args['src-path'],
    silent: args.silent,
  })
}
