import {
  assert,
  assertEquals,
  createTempDir,
  join,
  mockConsole,
} from './test-utils.ts'
import type { RepomixConfig } from '../src/types.ts'

// Simplified version of runRepomix for testing
async function runRepomix(
  config: RepomixConfig,
  outputPath: string,
  shouldFail = false,
): Promise<{ success: boolean; repoName: string; outputPath: string } | null> {
  // Simulate failure based on shouldFail flag
  if (shouldFail) {
    return null
  }

  const remoteUrl = config.remote
  const fullUrl = remoteUrl && !remoteUrl.startsWith('http')
    ? `https://github.com/${remoteUrl}`
    : remoteUrl

  const repoName = fullUrl?.includes('github.com')
    ? fullUrl.split('/').pop() || 'unknown'
    : 'local codebase'

  return {
    success: true,
    repoName,
    outputPath: join(outputPath, `${repoName}.xml`),
  }
}

// Simplified processor that runs multiple mixes and handles failures
async function processConfigs(
  configs: RepomixConfig[],
  outputPath: string,
  failingIndexes: number[] = [],
): Promise<{ success: string[]; failure: string[] }> {
  const success: string[] = []
  const failure: string[] = []

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]
    const shouldFail = failingIndexes.includes(i)

    const result = await runRepomix(config, outputPath, shouldFail)

    if (result?.success) {
      success.push(result.repoName)
    } else {
      const repoName = config.remote?.split('/').pop() || 'unknown'
      failure.push(repoName)
      console.warn(`Failed to process config: ${repoName}`)
    }
  }

  return { success, failure }
}

Deno.test('processConfigs - handles when some mixes fail', async () => {
  const consoleMock = mockConsole()

  try {
    const configs: RepomixConfig[] = [
      { remote: 'owner/repo1' },
      { remote: 'owner/repo2' },
      { remote: 'owner/repo3' },
      { remote: 'owner/repo4' },
    ]

    // Set up to fail the 2nd and 4th configs
    const failingIndexes = [1, 3]

    const { success, failure } = await processConfigs(
      configs,
      './output',
      failingIndexes,
    )

    // Verify successful configs
    assertEquals(success.length, 2)
    assertEquals(success[0], 'repo1')
    assertEquals(success[1], 'repo3')

    // Verify failed configs
    assertEquals(failure.length, 2)
    assertEquals(failure[0], 'repo2')
    assertEquals(failure[1], 'repo4')

    // Verify warnings were logged for failures
    assertEquals(consoleMock.warns.calls.length, 2)
    assert(consoleMock.warns.calls[0].args[0].includes('repo2'))
    assert(consoleMock.warns.calls[1].args[0].includes('repo4'))
  } finally {
    consoleMock.restore()
  }
})

Deno.test('processConfigs - continues despite failures', async () => {
  const configs: RepomixConfig[] = [
    { remote: 'owner/repo1' },
    { remote: 'owner/repo2' },
    { remote: 'owner/repo3' },
  ]

  // Set up to fail the middle config
  const failingIndexes = [1]

  const { success, failure } = await processConfigs(
    configs,
    './output',
    failingIndexes,
  )

  // Verify first and last configs were processed
  assertEquals(success.length, 2)
  assertEquals(success[0], 'repo1')
  assertEquals(success[1], 'repo3')

  // Verify middle config failed
  assertEquals(failure.length, 1)
  assertEquals(failure[0], 'repo2')
})

Deno.test('processConfigs - handles all successful', async () => {
  const configs: RepomixConfig[] = [
    { remote: 'owner/repo1' },
    { remote: 'owner/repo2' },
  ]

  // No failing indexes
  const { success, failure } = await processConfigs(
    configs,
    './output',
  )

  // Verify all configs succeeded
  assertEquals(success.length, 2)
  assertEquals(success[0], 'repo1')
  assertEquals(success[1], 'repo2')

  // Verify no failures
  assertEquals(failure.length, 0)
})

Deno.test('processConfigs - handles all failing', async () => {
  const consoleMock = mockConsole()

  try {
    const configs: RepomixConfig[] = [
      { remote: 'owner/repo1' },
      { remote: 'owner/repo2' },
    ]

    // All configs fail
    const failingIndexes = [0, 1]

    const { success, failure } = await processConfigs(
      configs,
      './output',
      failingIndexes,
    )

    // Verify no configs succeeded
    assertEquals(success.length, 0)

    // Verify all configs failed
    assertEquals(failure.length, 2)
    assertEquals(failure[0], 'repo1')
    assertEquals(failure[1], 'repo2')

    // Verify warnings were logged for all failures
    assertEquals(consoleMock.warns.calls.length, 2)
  } finally {
    consoleMock.restore()
  }
})
