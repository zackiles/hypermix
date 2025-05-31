/**
 * AI Context Builder
 *
 * Builds XML context files for AI tools using repomix.
 * Fetches code from remote repositories or local codebase.
 *
 * Command-line options:
 * - --output-path, -o: Override the default output directory for all context files
 *   Example: `deno run -A scripts/build-context.ts --output-path ./custom/path`
 * - --silent, -s: Suppress all output except errors
 *
 * Config entries can be defined in the configs array with these properties:
 * - remote: GitHub repository in 'owner/repo' format (https://github.com/ prefix is optional)
 * - include: Array of glob patterns for files to include
 * - ignore: Array of glob patterns for files to ignore
 * - output: Custom output path relative to OUTPUT_PATH
 * - config: Path to an existing repomix.config.json file
 * - extraFlags: Additional command-line flags for repomix
 *
 * The script automatically updates .gitignore, .cursorignore, and .cursorignoreindex
 * to ensure proper handling of the generated context files.
 */

import { parseArgs } from '@std/cli/parse-args'
import { basename, dirname, extname, join, parse, relative } from '@std/path'
import { Spinner, type SpinnerOptions } from '@std/cli/unstable-spinner'
import { bold, brightYellow, dim, green, red, yellow } from '@std/fmt/colors'
import { toKebabCase } from '@std/text'
import { dedent } from '@std/text/unstable-dedent'
import { ensureDir, exists } from '@std/fs'
import { countTokens } from 'gpt-tokenizer/model/gpt-4o'
import { toTransformStream } from '@std/streams/to-transform-stream'
import { parse as parseJsonc } from 'jsonc-parser'
import { loadConfig } from './load-config.ts'
import {
  DEFAULT_PATH,
  REPOMIX_BOOLEAN_FLAGS,
  REPOMIX_DEFAULT_FLAGS,
} from './constants.ts'
import type { RepomixConfig } from './types.ts'
import { handleAddCommand } from './add-mix.ts'

let globalArgs: ReturnType<typeof parseArgs>
let logger: ReturnType<typeof createLogger>

const createLogger = (silent: boolean) => ({
  log: (...args: unknown[]) => !silent && console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (...args: unknown[]) =>
    !silent && Deno.env.get('DEBUG') && console.log('[DEBUG]', ...args),
})

const createFileHelpers = () => {
  const kebabFilename = (path: string) => {
    const parsed = parse(path)
    const kebabName = toKebabCase(parsed.name)
    return join(parsed.dir, `${kebabName}${parsed.ext}`)
  }

  const outputFromGithub = (url: string) => {
    if (!url.includes('github.com')) return 'codebase.xml'
    const parts = url.replace('https://github.com/', '').split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}.xml` : 'codebase.xml'
  }

  return { kebabFilename, outputFromGithub }
}

const buildRepomixArgs = async (
  config: RepomixConfig,
  outputPath: string,
  helpers: ReturnType<typeof createFileHelpers>,
) => {
  const args: string[] = ['repomix']

  const remoteUrl = config.remote
  const fullUrl = remoteUrl && !remoteUrl.startsWith('http')
    ? `https://github.com/${remoteUrl}`
    : remoteUrl

  if (fullUrl) args.push('--remote', fullUrl)

  const includes = Array.isArray(config.include) ? config.include : []
  const finalIncludes = includes.length ? includes : ['**/*']
  args.push('--include', finalIncludes.join(','))

  const ignores = Array.isArray(config.ignore) ? config.ignore : []
  if (ignores.length) args.push('--ignore', ignores.join(','))

  // Only pass repomix config if explicitly specified in the config object
  const configPath = config.config ?? config.repomixConfig
  if (configPath) {
    args.push('--config', configPath)
  }

  args.push(...REPOMIX_DEFAULT_FLAGS)

  if (config.extraFlags?.length) {
    args.push(...config.extraFlags)
  }

  // Determine the final output path
  let finalOutputPath: string
  if (configPath) {
    // For repomix configs, read the config to determine output path or use default
    try {
      const configContent = await Deno.readTextFile(configPath)
      const repomixConfig = parseJsonc(configContent)
      // Check various possible output path configurations in repomix config
      const configOutputPath = repomixConfig.output?.filePath ||
        repomixConfig.outputPath ||
        repomixConfig.output

      if (typeof configOutputPath === 'string') {
        finalOutputPath = configOutputPath
      } else {
        // Default to codebase.xml if no output path specified in repomix config
        finalOutputPath = join(outputPath, 'codebase.xml')
      }
    } catch (error) {
      logger?.warn(`Failed to read repomix config file: ${error}`)
      // Default to codebase.xml on error
      finalOutputPath = join(outputPath, 'codebase.xml')
    }
  } else {
    finalOutputPath = helpers.kebabFilename(
      config.output
        ? join(outputPath, config.output)
        : fullUrl
        ? join(outputPath, helpers.outputFromGithub(fullUrl))
        : join(outputPath, 'codebase.xml'),
    )
  }

  // Always add the output path
  args.push('--output', finalOutputPath)

  return {
    args,
    fullUrl,
    outputPath: finalOutputPath,
  }
}

const runRepomix = async (
  config: RepomixConfig,
  outputPath: string,
  helpers: ReturnType<typeof createFileHelpers>,
) => {
  // Validate repomix config file exists if specified
  if (config.repomixConfig) {
    const configExists = await exists(config.repomixConfig)
    if (!configExists) {
      logger.error(`Repomix config file not found: ${config.repomixConfig}`)
      return null
    }
  }

  // Validate extraFlags to ensure they exist in BOOLEAN_FLAGS
  if (config.extraFlags?.length) {
    const invalidFlags = config.extraFlags.filter((flag) =>
      !(REPOMIX_BOOLEAN_FLAGS as readonly string[]).includes(flag)
    )
    if (invalidFlags.length > 0) {
      logger.error(
        `Invalid flags in extraFlags: ${
          invalidFlags.join(', ')
        }. Valid flags are: ${REPOMIX_BOOLEAN_FLAGS.join(', ')}`,
      )
      return null
    }
  }

  const { args, fullUrl, outputPath: finalOutputPath } = await buildRepomixArgs(
    config,
    outputPath,
    helpers,
  )

  // Ensure output directory exists
  await ensureDir(dirname(finalOutputPath))

  logger.debug(`Running repomix command: ${args.join(' ')}`)

  const cmd = new Deno.Command(args[0], { args: args.slice(1) })
  const { success, stderr, stdout } = await cmd.output()

  if (!success) {
    const errorMsg = new TextDecoder().decode(stderr)
    logger.warn(`Repomix command failed for ${fullUrl || 'local'}:`, errorMsg)
    return null
  }

  // Verify the output file was actually created at the correct path
  const fileExists = await exists(finalOutputPath)
  if (!fileExists) {
    const stdoutMsg = new TextDecoder().decode(stdout)
    logger.warn(
      `Repomix completed but no output file created at ${finalOutputPath}. Please ensure your repomix.config.json specifies an output path, or a default 'codebase.xml' will be used. Stdout:`,
      stdoutMsg,
    )
    return null
  }

  const repoName = fullUrl?.includes('github.com')
    ? fullUrl.split('/').pop()
    : (fullUrl || 'local codebase')

  return {
    success: true,
    repoName: repoName || 'unknown',
    outputPath: finalOutputPath,
  }
}

const modifyIgnoreFile = async (
  filePath: string,
  pattern: string,
  shouldExist: boolean,
  contentToAdd: string,
  fileType: 'gitignore' | 'cursorignoreindex' | 'cursorignore',
) => {
  const messages = {
    gitignore:
      'Ignored from tracking. Contributors will have to run this script on clone to generate the context files, or you can add it to run in git-hooks to run on clone',
    cursorignoreindex:
      "Preventing Cursor from indexing repomix files prevents unintentionally polluting the agent's context window by automatically indexing. You'll still be able to manually `@` or `add to chat` for files that aren't indexed",
    cursorignore:
      "Ensured we're not blocking Cursor from seeing the file at all. This is required to allow Cursor to access the file since we'll have it gitignored",
  }

  try {
    const fileExists = await exists(filePath)

    if (!fileExists) {
      if (shouldExist) {
        await Deno.writeTextFile(filePath, contentToAdd.trim())
        logger.log(`Created ${basename(filePath)}: ${messages[fileType]}`)
      }
      return
    }

    const content = await Deno.readTextFile(filePath)
    const lines = content.split('\n')

    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regexPattern = new RegExp(
      `^(?:\\./)?(${escapedPattern}|${
        escapedPattern.replace(/\\\*\\\*/g, '\\*')
      }|${escapedPattern.replace(/\\\*\\\*/g, '')})/?(?:\\*?)?$`,
    )

    const patternExists = lines.some((line) => regexPattern.test(line.trim()))

    if ((shouldExist && !patternExists) || (!shouldExist && patternExists)) {
      await Deno.writeTextFile(filePath, content + contentToAdd)
      logger.log(`Updated ${basename(filePath)}: ${messages[fileType]}`)
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error processing ${filePath}:`, errorMessage)
  }
}

const updateIgnoreFiles = async (outputPath: string) => {
  const relativePath = relative(Deno.cwd(), outputPath)
  // Normalize to forward slashes for glob patterns (ignore files expect Unix-style paths)
  // these dot-files will never have Windows paths, so we can safely replace all backslashes with forward slashes momentarily
  const normalizedPath = relativePath.replaceAll('\\', '/')
  const contextPattern = `${normalizedPath}/**/*.xml`

  await modifyIgnoreFile(
    join(Deno.cwd(), '.gitignore'),
    contextPattern,
    true,
    `\n# AI context files\n${contextPattern}\n`,
    'gitignore',
  )
  await modifyIgnoreFile(
    join(Deno.cwd(), '.cursorignoreindex'),
    contextPattern,
    true,
    `\n# AI context files\n${contextPattern}\n`,
    'cursorignoreindex',
  )
  await modifyIgnoreFile(
    join(Deno.cwd(), '.cursorignore'),
    `!${contextPattern}`,
    true,
    `\n# Include AI context files (auto-generated by the build-context script)\n!${contextPattern}\n`,
    'cursorignore',
  )
}

async function* readFileStreamChunks(
  filePath: string,
): AsyncGenerator<string, void, unknown> {
  using file = await Deno.open(filePath, { read: true })

  const tokenChunkTransform = toTransformStream(
    async function* (source: ReadableStream<Uint8Array>) {
      const decoder = new TextDecoder()
      let buffer = ''

      for await (const chunk of source) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true })

        while (buffer.length >= 8192) {
          const textChunk = buffer.slice(0, 8192)
          buffer = buffer.slice(8192)
          yield textChunk
        }
      }

      buffer += decoder.decode()
      if (buffer) yield buffer
    },
  )

  const stream = file.readable.pipeThrough(tokenChunkTransform)

  for await (const chunk of stream) {
    yield chunk
  }
}

async function* fetchAllFileTokens(
  filePaths: string[],
): AsyncGenerator<{ filename: string; tokens: number }, void, void> {
  const filePromises = filePaths.map(async (filePath) => {
    const filename = basename(filePath, extname(filePath))
    let fileTokens = 0

    for await (const chunk of readFileStreamChunks(filePath)) {
      fileTokens += countTokens(chunk)
    }

    return { filename, tokens: fileTokens }
  })

  for (const promise of filePromises) {
    yield await promise
  }
}

const countTokensInFiles = async (
  filePaths: string[],
): Promise<Record<string, number> & { totalTokens: number }> => {
  const result: Record<string, number> = {}
  let totalTokens = 0

  for await (const { filename, tokens } of fetchAllFileTokens(filePaths)) {
    result[filename] = tokens
    totalTokens += tokens
  }

  return { ...result, totalTokens }
}

const showHelp = () => {
  const helpText = dedent`
    ${bold('🔥 Hypermix')} - Real-time, token-aware, intelligent repomixing

    
    ${bold('USAGE:')}
      hypermix [COMMAND] [OPTIONS]

    
    ${bold('COMMANDS:')}
      init                       Initialize a new hypermix.config.ts file
      add <repo>                 Add a GitHub repository to your config
                                   ${
    dim('# Format: owner/repo or full GitHub URL')
  }      

    
    ${bold('OPTIONS:')}
      ${green('--help, -h')}                 Show this help message
      ${green('--config, -c')}       <path>  Specify config file path
      ${
    green('--output-path, -o')
  }  <path>  Override output directory for context files
      ${green('--silent, -s')}               Suppress all output except errors

    
    ${bold('EXAMPLES:')}
      ${dim(' # Initialize a new config file')}
      hypermix init

      ${dim('# Use default config (hypermix.config.ts)')}
      hypermix

      ${dim('# Use custom config file')}
      hypermix --config ./custom.config.ts

      ${dim('# Override output directory')}
      hypermix --output-path ./custom-output

      ${dim('# Run silently')}
      hypermix --silent

      ${dim('# Add a GitHub repository to your config')}
      hypermix add openai/openai-node

    
    ${bold('CONFIG FILES:')}
      Hypermix looks for configuration files in this order:
      • ${dim('hypermix.config.ts')}
      • ${dim('hypermix.config.js')}
      • ${dim('hypermix.config.json')}
      • ${dim('hypermix.config.jsonc')}

    
    ${bold('GETTING STARTED:')}
      1. Run ${green('hypermix init')} to create a config file
      2. Edit the config to specify repositories and settings
      3. Run ${green('hypermix')} to generate AI context files
                                                              
    ${dim('For more information, visit: https://github.com/zackiles/hypermix')}
  `

  logger.log(helpText)
}

async function main() {
  const firstArg = Deno.args[0]
  const secondArg = Deno.args[1]

  if (firstArg === 'add') {
    const isSilent = Deno.args.includes('--silent') || Deno.args.includes('-s')
    logger = createLogger(isSilent)

    if (!secondArg) {
      logger.error(
        red('Error: Missing repository identifier for "add" command.'),
      )
      logger.log('Usage: hypermix add <owner/repo | GitHub URL>')
      Deno.exit(1)
    }
    await handleAddCommand(secondArg, logger)
    return
  }

  if (firstArg === 'init') {
    const isSilent = Deno.args.includes('--silent') || Deno.args.includes('-s')
    logger = createLogger(isSilent)
    const { init } = await import('./init.ts')
    await init()
    return
  }

  globalArgs = parseArgs(Deno.args, {
    string: ['output-path', 'config'],
    boolean: ['silent', 'help'],
    alias: {
      'output-path': ['outputPath', 'o'],
      'silent': ['s'],
      'config': ['c'],
      'help': ['h'],
    },
  })
  logger = createLogger(globalArgs.silent ?? false)

  // Handle --help flag
  if (globalArgs.help) {
    showHelp()
    return
  }

  const helpers = createFileHelpers()

  // Try to load config and show help if not found
  let hypermixConfig: Awaited<ReturnType<typeof loadConfig>>
  try {
    hypermixConfig = await loadConfig(globalArgs.config)
  } catch (error) {
    if (
      error instanceof Error && error.message.includes('No config file found')
    ) {
      logger.error(
        red(
          '❌ No configuration file found in the current directory or provided with --config',
        ),
      )
      logger.error('')
      showHelp()
      Deno.exit(1)
    }
    throw error
  }

  const configs = hypermixConfig.mixes
  const outputPath = globalArgs['output-path'] ?? hypermixConfig.outputPath ??
    DEFAULT_PATH
  logger.log('-'.repeat(40))
  logger.log(
    dedent(
      `${bold('🔥 Hypermixing the following repos:')}\n${
        dim(
          configs.map((c) => c.remote).slice(0, 4).join(', ') +
            (configs.length > 4 ? ` and ${configs.length - 4} more...` : ''),
        )
      }`,
    ),
  )

  let spinner: Spinner | null = null
  if (!globalArgs.silent && !hypermixConfig.silent) {
    const spinnerOptions: SpinnerOptions = {
      message: 'Building context files...',
      color: 'cyan',
    }
    spinner = new Spinner(spinnerOptions)
    spinner.start()
  }

  const results: Array<{ repoName: string; outputPath: string }> = []

  for (const config of configs) {
    const result = await runRepomix(config, outputPath, helpers)
    if (result?.success) {
      results.push({ repoName: result.repoName, outputPath: result.outputPath })
    }
  }

  spinner?.stop()
  await updateIgnoreFiles(outputPath)

  // Filter to only include files that actually exist
  const existingResults = []
  for (const result of results) {
    if (await exists(result.outputPath)) {
      existingResults.push(result)
    } else {
      logger.warn(`Output file does not exist: ${result.outputPath}`)
    }
  }

  if (existingResults.length === 0) {
    logger.error(
      'No valid output files were created. Check your configuration and ensure repomix is installed.',
    )
    Deno.exit(1)
  }

  const filePaths = existingResults.map((result) => result.outputPath)
  const tokensInFiles = await countTokensInFiles(filePaths)
  const { totalTokens, ...fileTokens } = tokensInFiles

  const getTokenColor = (tokens: number): (str: string) => string => {
    if (tokens < 60000) return green
    if (tokens < 120000) return yellow
    if (tokens < 200000) return brightYellow
    return red
  }

  logger.log('┌────────────────┬─────────────┐')
  logger.log('│ File           │ Tokens      │')
  logger.log('├────────────────┼─────────────┤')

  for (const [file, tokens] of Object.entries(fileTokens)) {
    const colorFn = getTokenColor(tokens)
    const paddedFile = file.padEnd(14)
    const tokenText = Number(tokens).toLocaleString()
    const paddedTokens = tokenText.padEnd(11)
    const coloredTokens = colorFn(paddedTokens)
    logger.log(`│ ${paddedFile} │ ${coloredTokens} │`)
  }

  logger.log('└────────────────┴─────────────┘')
  logger.log('='.repeat(40))
  logger.log(`${bold('Total Tokens')}: ${dim(totalTokens.toLocaleString())}`)

  const hasHighTokenFiles = Object.values(fileTokens).some((tokens) =>
    tokens >= 60000
  )
  if (hasHighTokenFiles) {
    logger.log('-'.repeat(40))
    logger.log(
      brightYellow('⚠️  TOKEN COUNT WARNING'),
    )
    logger.log('')
    logger.log(
      `One or more files exceed ${
        yellow('60k tokens')
      }. Consider these averages:`,
    )
    logger.log(`• Average model limit: ${bold('120k tokens')}`)
    logger.log(`• System prompt usage: ${bold('20-40k tokens')}`)
    logger.log(`• Chat + working files: ${bold('additional space needed')}`)
    logger.log('')
    logger.log(
      `💡 ${dim('Add the')} ${bold('--compress')} ${
        dim('flag to your config for large files')
      }`,
    )
  }
  logger.log('='.repeat(40))
  logger.log(
    `✅ ${bold(`Built ${existingResults.length} files to`)} ${dim(outputPath)}`,
  )
}

if (import.meta.main) {
  main().then(() => Deno.exit(0)).catch((error) => {
    logger.error(
      Deno.inspect(error, { colors: true, depth: 9 }),
    )
    Deno.exit(1)
  })
}

export { main }
export { init } from './init.ts'
