/**
 * @module load_config
 *
 * Loads and validates hypermix configuration from various file formats.
 * Supports TypeScript (.ts), JavaScript (.js), JSON (.json), and JSONC (.jsonc)
 * configuration files with automatic format detection.
 *
 * @example
 * ```ts
 * import { loadConfig } from "./load-config.ts"
 * const config = await loadConfig("./hypermix.config.ts")
 * ```
 */

import { extname } from '@std/path'
import { parse } from '@std/jsonc'
import type { HypermixConfig, RepomixConfig } from './types.ts'
import { HYPERMIX_CONFIG_NAMES } from './constants.ts'

async function loadConfig(configPath?: string): Promise<HypermixConfig> {
  let resolvedConfigPath = configPath

  if (!resolvedConfigPath) {
    for (const name of HYPERMIX_CONFIG_NAMES) {
      try {
        await Deno.stat(name)
        resolvedConfigPath = name
        break
      } catch {
        // File doesn't exist, continue to next
      }
    }

    if (!resolvedConfigPath) {
      throw new Error(
        `No config file found. Expected one of: ${
          HYPERMIX_CONFIG_NAMES.join(', ')
        }`,
      )
    }
  }

  const ext = extname(resolvedConfigPath).toLowerCase()

  if (ext === '.ts' || ext === '.js') {
    const fileUrl = new URL(`file://${Deno.cwd()}/${resolvedConfigPath}`).href
    const module = await import(fileUrl)
    const defaultExport = module.default

    // Handle both array of RepomixConfig and HypermixConfig object
    if (Array.isArray(defaultExport)) {
      return { mixes: defaultExport as RepomixConfig[] }
    }

    return defaultExport as HypermixConfig
  }

  if (ext === '.json' || ext === '.jsonc') {
    const content = await Deno.readTextFile(resolvedConfigPath)
    const parsedConfig = parse(content)

    if (parsedConfig === null || typeof parsedConfig !== 'object') {
      throw new Error('Invalid configuration: config must be a non-null object')
    }

    const configData = parsedConfig as Record<string, unknown>

    if (!configData.mixes || !Array.isArray(configData.mixes)) {
      throw new Error('Invalid configuration: missing or invalid "mixes" array')
    }

    return configData as HypermixConfig
  }

  throw new Error(
    `Unsupported config file type: ${ext}. Only .json, .jsonc, .js, and .ts files are supported.`,
  )
}

export { loadConfig }
