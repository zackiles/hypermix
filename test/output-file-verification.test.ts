import {
  assert,
  assertEquals,
  createTempDir,
  createTempFile,
  join,
  mockConsole,
} from './test-utils.ts'

// Function to filter only existing output files
async function filterExistingOutputFiles(
  results: Array<{ repoName: string; outputPath: string }>,
): Promise<Array<{ repoName: string; outputPath: string }>> {
  const existingResults = []

  for (const result of results) {
    try {
      await Deno.stat(result.outputPath)
      existingResults.push(result)
    } catch {
      console.warn(`Output file does not exist: ${result.outputPath}`)
    }
  }

  return existingResults
}

// Mock token counting function (simplified)
function countTokens(
  files: string[],
): Promise<Record<string, number> & { totalTokens: number }> {
  const result: Record<string, number> = {}
  let totalTokens = 0

  for (const file of files) {
    const basename = file.split('/').pop()?.split('.')[0] || 'unknown'
    // Mock token count based on file name length
    const tokens = basename.length * 1000
    result[basename] = tokens
    totalTokens += tokens
  }

  return Promise.resolve({ ...result, totalTokens })
}

Deno.test('filterExistingOutputFiles - includes only existing files', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create some output files
    const file1 = join(path, 'repo1.xml')
    const file2 = join(path, 'repo2.xml')

    await createTempFile(file1, '<xml>test</xml>')
    // file2 intentionally not created

    const results = [
      { repoName: 'repo1', outputPath: file1 },
      { repoName: 'repo2', outputPath: file2 },
    ]

    // Mock console.warn to capture warnings
    const consoleMock = mockConsole()

    try {
      const filtered = await filterExistingOutputFiles(results)

      // Should only include the existing file
      assertEquals(filtered.length, 1)
      assertEquals(filtered[0].repoName, 'repo1')

      // Should warn about the missing file
      assert(consoleMock.warns.calls.length > 0)
      assert(consoleMock.warns.calls[0].args[0].includes('repo2.xml'))
    } finally {
      consoleMock.restore()
    }
  } finally {
    await cleanup()
  }
})

Deno.test('filterExistingOutputFiles - handles all files missing', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create some output paths but don't create the files
    const file1 = join(path, 'repo1.xml')
    const file2 = join(path, 'repo2.xml')

    const results = [
      { repoName: 'repo1', outputPath: file1 },
      { repoName: 'repo2', outputPath: file2 },
    ]

    // Mock console.warn to capture warnings
    const consoleMock = mockConsole()

    try {
      const filtered = await filterExistingOutputFiles(results)

      // Should have no files
      assertEquals(filtered.length, 0)

      // Should warn about both missing files
      assertEquals(consoleMock.warns.calls.length, 2)
    } finally {
      consoleMock.restore()
    }
  } finally {
    await cleanup()
  }
})

Deno.test('filterExistingOutputFiles - returns all when all exist', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create all output files
    const file1 = join(path, 'repo1.xml')
    const file2 = join(path, 'repo2.xml')

    await createTempFile(file1, '<xml>test1</xml>')
    await createTempFile(file2, '<xml>test2</xml>')

    const results = [
      { repoName: 'repo1', outputPath: file1 },
      { repoName: 'repo2', outputPath: file2 },
    ]

    // Mock console.warn to capture warnings
    const consoleMock = mockConsole()

    try {
      const filtered = await filterExistingOutputFiles(results)

      // Should include all files
      assertEquals(filtered.length, 2)

      // Should not warn
      assertEquals(consoleMock.warns.calls.length, 0)
    } finally {
      consoleMock.restore()
    }
  } finally {
    await cleanup()
  }
})

Deno.test('countTokens - counts tokens for all files', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create some output files
    const file1 = join(path, 'short.xml')
    const file2 = join(path, 'longerfilename.xml')

    await createTempFile(file1, '<xml>test</xml>')
    await createTempFile(file2, '<xml>test</xml>')

    // Count tokens
    const tokensResult = await countTokens([file1, file2])

    // Should have token counts for both files
    assertEquals(Object.keys(tokensResult).length, 3) // 2 files + totalTokens
    assertEquals(tokensResult.short, 5000) // "short" length is 5
    assertEquals(tokensResult.longerfilename, 14000) // "longerfilename" length is 14
    assertEquals(tokensResult.totalTokens, 19000) // 5000 + 14000
  } finally {
    await cleanup()
  }
})

Deno.test('countTokens - skips non-existent files', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create only one of the files
    const file1 = join(path, 'exists.xml')
    const file2 = join(path, 'notexists.xml')

    await createTempFile(file1, '<xml>test</xml>')

    // First filter to ensure only existing files are counted
    const results = [
      { repoName: 'exists', outputPath: file1 },
      { repoName: 'notexists', outputPath: file2 },
    ]

    const filtered = await filterExistingOutputFiles(results)
    const filePaths = filtered.map((result) => result.outputPath)

    // Count tokens
    const tokensResult = await countTokens(filePaths)

    // Should only count the existing file
    assertEquals(Object.keys(tokensResult).length, 2) // 1 file + totalTokens
    assertEquals(tokensResult.exists, 6000) // "exists" length is 6
    assertEquals(tokensResult.totalTokens, 6000)
    assertEquals(tokensResult.notexists, undefined)
  } finally {
    await cleanup()
  }
})
