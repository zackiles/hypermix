import {
  assert,
  assertEquals,
  createTempDir,
  createTempFile,
  join,
} from './test-utils.ts'
import type { RepomixConfig } from '../src/types.ts'

// Create a simpler version of buildRepomixArgs for testing
function buildRepomixArgs(
  config: RepomixConfig,
  outputPath: string,
) {
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

  // Default flags would be added here in the real implementation

  const finalOutputPath = join(outputPath, 'output.xml')

  // When repomix config is provided, we don't add the output flag
  // The real implementation would read the output path from the config
  if (!configPath) {
    args.push('--output', finalOutputPath)
  }

  return {
    args,
    fullUrl,
    outputPath: finalOutputPath,
    hasRepomixConfig: !!configPath,
  }
}

// Read the output path from a repomix config file
async function readOutputPathFromConfig(
  configPath: string,
): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(configPath)
    const config = JSON.parse(content)
    return config.output?.filePath || null
  } catch {
    return null
  }
}

Deno.test('buildRepomixArgs - no output flag when repomix config is provided', () => {
  const config: RepomixConfig = {
    repomixConfig: './repomix.config.json',
  }

  const { args, hasRepomixConfig } = buildRepomixArgs(config, './output')

  // Verify config path is passed
  assert(args.includes('--config'))
  assertEquals(args[args.indexOf('--config') + 1], './repomix.config.json')

  // Verify output flag is not included
  assertEquals(args.includes('--output'), false)

  // Verify hasRepomixConfig flag is set
  assertEquals(hasRepomixConfig, true)
})

Deno.test('buildRepomixArgs - includes output flag when no repomix config', () => {
  const config: RepomixConfig = {
    include: ['**/*.ts'],
  }

  const { args, hasRepomixConfig } = buildRepomixArgs(config, './output')

  // Verify config flag is not included
  assertEquals(args.includes('--config'), false)

  // Verify output flag is included
  assert(args.includes('--output'))

  // Verify hasRepomixConfig flag is not set
  assertEquals(hasRepomixConfig, false)
})

Deno.test('readOutputPathFromConfig - reads output path from config file', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a repomix config file
    const configPath = join(path, 'repomix.config.json')
    const configContent = JSON.stringify(
      {
        output: {
          filePath: './custom-output.xml',
        },
      },
      null,
      2,
    )

    await createTempFile(configPath, configContent)

    // Read the output path
    const outputPath = await readOutputPathFromConfig(configPath)

    // Verify the output path was correctly read
    assertEquals(outputPath, './custom-output.xml')
  } finally {
    await cleanup()
  }
})

Deno.test('readOutputPathFromConfig - handles missing output', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a repomix config file without output section
    const configPath = join(path, 'repomix.config.json')
    const configContent = JSON.stringify(
      {
        include: ['**/*.ts'],
      },
      null,
      2,
    )

    await createTempFile(configPath, configContent)

    // Read the output path
    const outputPath = await readOutputPathFromConfig(configPath)

    // Verify the output path is null
    assertEquals(outputPath, null)
  } finally {
    await cleanup()
  }
})

Deno.test('readOutputPathFromConfig - handles invalid file', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create an invalid JSON file
    const configPath = join(path, 'invalid.json')
    await createTempFile(configPath, 'not valid JSON')

    // Read the output path
    const outputPath = await readOutputPathFromConfig(configPath)

    // Verify the output path is null
    assertEquals(outputPath, null)
  } finally {
    await cleanup()
  }
})

Deno.test('readOutputPathFromConfig - handles non-existent file', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Try to read a non-existent file
    const configPath = join(path, 'non-existent.json')

    // Read the output path
    const outputPath = await readOutputPathFromConfig(configPath)

    // Verify the output path is null
    assertEquals(outputPath, null)
  } finally {
    await cleanup()
  }
})
