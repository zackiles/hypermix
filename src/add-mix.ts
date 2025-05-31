/**
 * @module add_mix
 *
 * Handles adding new GitHub repositories to the hypermix configuration.
 * Provides functionality to validate GitHub repositories, normalize repository URLs,
 * and update various config file formats (TypeScript, JavaScript, JSON, JSONC).
 *
 * @example
 * ```ts
 * import { handleAddCommand } from "./add-mix.ts"
 * await handleAddCommand("owner/repo", logger)
 * ```
 */

import { exists } from '@std/fs'
import { join, resolve } from '@std/path'
import { parse as parseJsonc } from 'jsonc-parser'
import { green, yellow } from '@std/fmt/colors'
import { HYPERMIX_CONFIG_NAMES } from './constants.ts'
import type { HypermixConfig, RepomixConfig } from './types.ts'

type Logger = {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

async function findHypermixConfigPath(): Promise<string> {
  for (const configName of HYPERMIX_CONFIG_NAMES) {
    const configPath = join(Deno.cwd(), configName)
    if (await exists(configPath)) {
      return configPath
    }
  }
  throw new Error(
    'No hypermix config file found. Run "hypermix init" to create one.',
  )
}

async function normalizeAndValidateGithubRepo(
  repoInput: string,
): Promise<{ shorthand: string; fullUrl: string }> {
  let shorthand: string
  let fullUrl: string

  if (repoInput.startsWith('https://github.com/')) {
    fullUrl = repoInput
    // Extract owner/repo from full URL
    const match = repoInput.match(/github\.com\/([^\/]+\/[^\/]+)/)
    if (!match) {
      throw new Error('Invalid GitHub repository URL format')
    }
    shorthand = match[1]
  } else if (repoInput.includes('/')) {
    // Assume it's owner/repo shorthand
    shorthand = repoInput
    fullUrl = `https://github.com/${repoInput}`
  } else {
    throw new Error(
      'Invalid repository format. Use "owner/repo" or full GitHub URL',
    )
  }

  // Validate the repository exists
  try {
    const response = await fetch(fullUrl, { method: 'HEAD' })
    if (!response.ok) {
      throw new Error(
        `GitHub repository ${shorthand} not found or not accessible (${response.status})`,
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error
    }
    throw new Error(
      `Failed to validate GitHub repository ${shorthand}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  return { shorthand, fullUrl }
}

async function addMixToConfigFile(
  configPath: string,
  newMix: RepomixConfig,
  logger: Logger,
): Promise<boolean> {
  const rawContent = await Deno.readTextFile(configPath)
  const isJsonFile = configPath.endsWith('.json') ||
    configPath.endsWith('.jsonc')
  const isTsFile = configPath.endsWith('.ts') || configPath.endsWith('.js')

  if (isJsonFile) {
    const config: HypermixConfig = parseJsonc(rawContent)

    // Check if mix already exists
    if (config.mixes.some((mix) => mix.remote === newMix.remote)) {
      logger.warn(
        `Repository ${newMix.remote} already exists in configuration`,
      )
      return false
    }

    // Add new mix
    config.mixes.push(newMix)

    // Write back
    const updatedContent = JSON.stringify(config, null, 2)
    await Deno.writeTextFile(configPath, updatedContent)

    if (configPath.endsWith('.jsonc')) {
      logger.warn(
        'Warning: Comments in the .jsonc file have been removed during update',
      )
    }

    logger.log(
      green(`✓ Added ${newMix.remote} to ${configPath.split('/').pop()}`),
    )
    return true
  } else if (isTsFile) {
    // Check if remote already exists (simple string check)
    if (rawContent.includes(`remote: '${newMix.remote}'`)) {
      logger.warn(
        `Repository ${newMix.remote} already exists in configuration`,
      )
      return false
    }

    // Create the new entry string
    const newEntryString = `  {
    remote: '${newMix.remote}',
    include: ${JSON.stringify(newMix.include)},
    output: '${newMix.output}',
  }`

    // Find the mixes array
    const mixesMatch = rawContent.match(/mixes:\s*\[/)
    if (!mixesMatch || mixesMatch.index === undefined) {
      throw new Error('Could not find "mixes: [" in the config file')
    }

    // Find the corresponding closing ]
    const mixesStartIndex = mixesMatch.index + mixesMatch[0].length
    let bracketCount = 1
    let i = mixesStartIndex
    while (i < rawContent.length && bracketCount > 0) {
      if (rawContent[i] === '[') bracketCount++
      else if (rawContent[i] === ']') bracketCount--
      i++
    }

    if (bracketCount !== 0) {
      throw new Error('Could not find matching ] for mixes array')
    }

    const closingBracketIndex = i - 1

    // Check if we need a comma (if array is not empty)
    const arrayContent = rawContent.substring(
      mixesStartIndex,
      closingBracketIndex,
    ).trim()
    const needsComma = arrayContent.length > 0 && !arrayContent.endsWith(',')

    // Insert the new entry
    const before = rawContent.substring(0, closingBracketIndex)
    const after = rawContent.substring(closingBracketIndex)
    const comma = needsComma ? ',' : ''
    const updatedContent = `${before}${comma}\n${newEntryString},\n${after}`

    await Deno.writeTextFile(configPath, updatedContent)

    logger.log(
      green(`✓ Added ${newMix.remote} to ${configPath.split('/').pop()}`),
    )
    return true
  } else {
    throw new Error(`Unsupported config file type: ${configPath}`)
  }
}

export async function handleAddCommand(
  repoIdentifier: string,
  logger: Logger,
): Promise<void> {
  try {
    // Find config file
    const configPath = await findHypermixConfigPath()
    logger.log(`Found config file: ${configPath}`)

    // Normalize and validate GitHub repo
    const { shorthand, fullUrl } = await normalizeAndValidateGithubRepo(
      repoIdentifier,
    )
    logger.log(`Validated repository: ${shorthand}`)

    // Create new mix entry
    const newMix: RepomixConfig = {
      remote: shorthand,
      include: ['*.ts', '*.js', '*.md'],
      output: `${shorthand}.xml`,
    }

    // Add to config file
    const added = await addMixToConfigFile(configPath, newMix, logger)

    if (!added) {
      Deno.exit(0)
    }

    // Prompt to generate mixes
    const shouldGenerate = confirm(
      'Successfully added to config. Generate mixes now?',
    )

    if (shouldGenerate) {
      logger.log('\nGenerating mixes...')
      const absoluteConfigPath = resolve(configPath)

      // Detect if we're running as a compiled binary or in development
      const isCompiledBinary = !Deno.mainModule ||
        !Deno.mainModule.endsWith('.ts')

      let cmd: Deno.Command
      if (isCompiledBinary) {
        // Running as compiled binary - execute self
        cmd = new Deno.Command(Deno.execPath(), {
          args: ['--config', absoluteConfigPath],
          stdout: 'inherit',
          stderr: 'inherit',
        })
      } else {
        // Running in development - use deno run
        const mainModule = Deno.mainModule || 'src/mod.ts'
        const scriptPath = new URL(mainModule).pathname
        cmd = new Deno.Command(Deno.execPath(), {
          args: ['run', '-A', scriptPath, '--config', absoluteConfigPath],
          stdout: 'inherit',
          stderr: 'inherit',
        })
      }

      const status = await cmd.spawn().status
      Deno.exit(status.code)
    } else {
      logger.log(
        yellow('Skipping mix generation. Run "hypermix" to generate later.'),
      )
      Deno.exit(0)
    }
  } catch (error) {
    logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    )
    Deno.exit(1)
  }
}
