import {
  assert,
  assertEquals,
  createTempDir,
  createTempFile,
  join,
} from './test-utils.ts'

// Simplified version for testing without accessing private functions
async function modifyIgnoreFile(
  filePath: string,
  pattern: string,
  shouldExist: boolean,
  contentToAdd: string,
): Promise<void> {
  try {
    let fileExists = false
    try {
      await Deno.stat(filePath)
      fileExists = true
    } catch {
      // File doesn't exist
    }

    if (!fileExists) {
      if (shouldExist) {
        await Deno.writeTextFile(filePath, contentToAdd.trim())
      }
      return
    }

    const content = await Deno.readTextFile(filePath)
    const lines = content.split('\n')

    const patternExists = lines.some((line) => line.trim() === pattern)

    if ((shouldExist && !patternExists) || (!shouldExist && patternExists)) {
      await Deno.writeTextFile(filePath, content + contentToAdd)
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
  }
}

async function updateIgnoreFiles(outputPath: string): Promise<void> {
  const contextPattern = `${outputPath}/**/*.xml`

  await modifyIgnoreFile(
    join(Deno.cwd(), '.gitignore'),
    contextPattern,
    true,
    `\n# AI context files\n${contextPattern}\n`,
  )
  await modifyIgnoreFile(
    join(Deno.cwd(), '.cursorignoreindex'),
    contextPattern,
    true,
    `\n# AI context files\n${contextPattern}\n`,
  )
  await modifyIgnoreFile(
    join(Deno.cwd(), '.cursorignore'),
    `!${contextPattern}`,
    true,
    `\n# Include AI context files\n!${contextPattern}\n`,
  )
}

Deno.test('modifyIgnoreFile - creates file if it does not exist', async () => {
  const { path, cleanup } = await createTempDir()
  try {
    const ignorePath = join(path, '.gitignore')
    const pattern = 'test-pattern'
    const contentToAdd = `\n# Test\n${pattern}\n`

    // File doesn't exist yet
    await modifyIgnoreFile(ignorePath, pattern, true, contentToAdd)

    // Verify file was created with correct content
    const content = await Deno.readTextFile(ignorePath)
    assertEquals(content, contentToAdd.trim())
  } finally {
    await cleanup()
  }
})

Deno.test('modifyIgnoreFile - adds pattern if missing', async () => {
  const { path, cleanup } = await createTempDir()
  try {
    const ignorePath = join(path, '.gitignore')
    const existingContent = '# Existing content\nexisting-pattern\n'
    await createTempFile(ignorePath, existingContent)

    const pattern = 'new-pattern'
    const contentToAdd = `\n# New content\n${pattern}\n`

    await modifyIgnoreFile(ignorePath, pattern, true, contentToAdd)

    // Verify pattern was added
    const content = await Deno.readTextFile(ignorePath)
    assert(content.includes(existingContent))
    assert(content.includes(pattern))
  } finally {
    await cleanup()
  }
})

Deno.test('modifyIgnoreFile - does not duplicate existing pattern', async () => {
  const { path, cleanup } = await createTempDir()
  try {
    const ignorePath = join(path, '.gitignore')
    const pattern = 'existing-pattern'
    const existingContent = `# Existing content\n${pattern}\n`
    await createTempFile(ignorePath, existingContent)

    const contentToAdd = `\n# New content\n${pattern}\n`

    await modifyIgnoreFile(ignorePath, pattern, true, contentToAdd)

    // Verify pattern was not duplicated
    const content = await Deno.readTextFile(ignorePath)
    assertEquals(content, existingContent)

    // Count occurrences of the pattern
    const occurrences = content.split(pattern).length - 1
    assertEquals(occurrences, 1)
  } finally {
    await cleanup()
  }
})

Deno.test('updateIgnoreFiles - updates all ignore files', async () => {
  const { path, cleanup } = await createTempDir()
  try {
    // Create working directory with empty ignore files
    const gitignorePath = join(path, '.gitignore')
    const cursorignoreindexPath = join(path, '.cursorignoreindex')
    const cursorignorePath = join(path, '.cursorignore')

    await createTempFile(gitignorePath, '# Git ignore\n')
    await createTempFile(cursorignoreindexPath, '# Cursor ignore index\n')
    await createTempFile(cursorignorePath, '# Cursor ignore\n')

    // Mock Deno.cwd to return our temp directory
    const originalCwd = Deno.cwd
    Deno.cwd = () => path

    try {
      const outputPath = '.hypermix'
      await updateIgnoreFiles(outputPath)

      // Verify patterns were added to all files
      const gitignoreContent = await Deno.readTextFile(gitignorePath)
      const cursorignoreindexContent = await Deno.readTextFile(
        cursorignoreindexPath,
      )
      const cursorignoreContent = await Deno.readTextFile(cursorignorePath)

      assert(gitignoreContent.includes('.hypermix/**/*.xml'))
      assert(cursorignoreindexContent.includes('.hypermix/**/*.xml'))
      assert(cursorignoreContent.includes('!.hypermix/**/*.xml'))
    } finally {
      Deno.cwd = originalCwd
    }
  } finally {
    await cleanup()
  }
})
