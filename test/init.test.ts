import {
  assert,
  assertEquals,
  createTempDir,
  createTempFile,
  exists,
  join,
  mockConsole,
  mockDenoCommand,
} from './test-utils.ts'
import { init } from '../src/init.ts'

Deno.test('init - creates TypeScript config for TypeScript project', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create TypeScript project indicators
    await createTempFile(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'es2020' },
      }),
    )
    await Deno.mkdir(join(tempDir, 'src'))
    await createTempFile(
      join(tempDir, 'src', 'index.ts'),
      'console.log("hello")',
    )

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      // Should create TypeScript config
      assert(await exists(join(tempDir, 'hypermix.config.ts')))
      const config = await Deno.readTextFile(
        join(tempDir, 'hypermix.config.ts'),
      )
      assert(config.includes('export default'))
      assert(config.includes("output: '.hypermix'"))

      // Should create .hypermix directory
      assert(await exists(join(tempDir, '.hypermix')))

      // Should create repomix.config.json
      assert(await exists(join(tempDir, 'repomix.config.json')))
      const repomixConfig = JSON.parse(
        await Deno.readTextFile(join(tempDir, 'repomix.config.json')),
      )
      assertEquals(repomixConfig.output.include, ['src/**/*'])

      // Should create cursor rule
      assert(
        await exists(
          join(tempDir, '.cursor', 'rules', 'hypermix', 'cursor-rule.mdx'),
        ),
      )

      // Check console output
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('typescript project')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - creates JavaScript config for JavaScript project', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create JavaScript project indicators
    await createTempFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
      }),
    )
    await Deno.mkdir(join(tempDir, 'lib'))
    await createTempFile(
      join(tempDir, 'lib', 'index.js'),
      'console.log("hello")',
    )

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      // Should create JavaScript config
      assert(await exists(join(tempDir, 'hypermix.config.js')))
      const config = await Deno.readTextFile(
        join(tempDir, 'hypermix.config.js'),
      )
      assert(config.includes('module.exports ='))
      assert(config.includes("output: '.hypermix'"))

      // Should create repomix.config.json
      assert(await exists(join(tempDir, 'repomix.config.json')))
      const repomixConfig = JSON.parse(
        await Deno.readTextFile(join(tempDir, 'repomix.config.json')),
      )
      assertEquals(repomixConfig.output.include, ['lib/**/*'])

      // Check console output
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('javascript project')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - creates JSON config for unknown project type', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Don't create any project indicators

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      // Should create JSON config as fallback
      assert(await exists(join(tempDir, 'hypermix.config.json')))
      const config = JSON.parse(
        await Deno.readTextFile(join(tempDir, 'hypermix.config.json')),
      )
      assertEquals(config.output, '.hypermix')
      assertEquals(config.mixes, {})

      // Should warn about no source folders
      assert(
        consoleMock.warns.calls.some((call) =>
          call.args[0]?.includes('No source folders found')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - detects and excludes test folders', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create folders that should be included and excluded
    await Deno.mkdir(join(tempDir, 'src'))
    await createTempFile(join(tempDir, 'src', 'index.ts'), 'export {}')

    await Deno.mkdir(join(tempDir, 'lib'))
    await createTempFile(join(tempDir, 'lib', 'helper.ts'), 'export {}')

    await Deno.mkdir(join(tempDir, 'test'))
    await createTempFile(join(tempDir, 'test', 'test.ts'), 'Deno.test()')

    await Deno.mkdir(join(tempDir, 'scripts'))
    await createTempFile(join(tempDir, 'scripts', 'build.ts'), 'console.log()')

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      const repomixConfig = JSON.parse(
        await Deno.readTextFile(join(tempDir, 'repomix.config.json')),
      )

      // Should include src and lib but not test or scripts
      assert(repomixConfig.output.include.includes('src/**/*'))
      assert(repomixConfig.output.include.includes('lib/**/*'))
      assert(!repomixConfig.output.include.includes('test/**/*'))
      assert(!repomixConfig.output.include.includes('scripts/**/*'))

      // Check console output shows found folders
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('Found source folders: lib, src')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - installs repomix for Deno project', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create Deno project
    await createTempFile(
      join(tempDir, 'deno.json'),
      JSON.stringify({
        tasks: {},
      }),
    )

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    // Override to simulate repomix not found
    const originalCommand = Deno.Command
    let repomixCheckCalled = false
    // @ts-ignore overriding built-in
    Deno.Command = class MockCommand {
      constructor(
        public command: string,
        public options: { args: string[]; stdout?: string; stderr?: string },
      ) {}

      output() {
        if (
          this.command === 'repomix' && this.options.args[0] === '--version'
        ) {
          repomixCheckCalled = true
          return Promise.resolve({
            success: false,
            stdout: new Uint8Array(),
            stderr: new Uint8Array(),
          })
        }
        return Promise.resolve({
          success: true,
          stdout: new Uint8Array(),
          stderr: new Uint8Array(),
        })
      }
    }

    try {
      await init()

      assert(repomixCheckCalled)

      // Should show installation message
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('Installing repomix')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
      // @ts-ignore restoring built-in
      Deno.Command = originalCommand
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - installs repomix for npm project', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create npm project
    await createTempFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
      }),
    )

    const consoleMock = mockConsole()

    // Mock command to track npm install call
    const commandCalls: { command: string; args: string[] }[] = []
    const originalCommand = Deno.Command
    // @ts-ignore overriding built-in
    Deno.Command = class MockCommand {
      constructor(
        public command: string,
        public options: { args: string[]; stdout?: string; stderr?: string },
      ) {
        commandCalls.push({ command, args: options.args })
      }

      output() {
        if (
          this.command === 'repomix' && this.options.args[0] === '--version'
        ) {
          return Promise.resolve({
            success: false,
            stdout: new Uint8Array(),
            stderr: new Uint8Array(),
          })
        }
        return Promise.resolve({
          success: true,
          stdout: new Uint8Array(),
          stderr: new Uint8Array(),
        })
      }
    }

    try {
      await init()

      // Should call npm install
      const npmCall = commandCalls.find((call) => call.command === 'npm')
      assert(npmCall)
      assertEquals(npmCall.args, ['install', 'repomix', '--save-dev'])
    } finally {
      consoleMock.restore()
      // @ts-ignore restoring built-in
      Deno.Command = originalCommand
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - updates existing config with mixes', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create existing config
    await createTempFile(
      join(tempDir, 'hypermix.config.json'),
      JSON.stringify({
        output: '.hypermix',
        mixes: {},
      }),
    )

    // Create source folder
    await Deno.mkdir(join(tempDir, 'src'))
    await createTempFile(join(tempDir, 'src', 'index.ts'), 'export {}')

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      // Since there are TypeScript files, it will create a TypeScript config
      // even though a JSON config exists
      assert(await exists(join(tempDir, 'hypermix.config.ts')))

      // The TypeScript config should have the mixes
      const config = await Deno.readTextFile(
        join(tempDir, 'hypermix.config.ts'),
      )
      assert(config.includes('main:'))
      assert(config.includes('repomixConfig:'))

      // Should create repomix.config.json
      const repomixConfig = JSON.parse(
        await Deno.readTextFile(join(tempDir, 'repomix.config.json')),
      )
      assertEquals(repomixConfig.output.include, ['src/**/*'])

      // Should detect as TypeScript project
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('Created hypermix.config.ts')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - creates cursor rule with correct replacements', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      const cursorRulePath = join(
        tempDir,
        '.cursor',
        'rules',
        'hypermix',
        'cursor-rule.mdx',
      )
      assert(await exists(cursorRulePath))

      const content = await Deno.readTextFile(cursorRulePath)
      const projectName = tempDir.split('/').pop()

      // Check that the file list was correctly inserted
      assert(content.includes(`globs: ${projectName}-main-repomix.xml`))
      assert(content.includes(`${projectName}-main-repomix.xml`))

      // Check that the content is from the template
      assert(content.includes('Understanding Your Hypermix Generated Files'))
      assert(content.includes('Purpose'))
      assert(content.includes('Usage'))
      assert(content.includes('Tips'))
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})

Deno.test('init - handles TypeScript project with package.json', async () => {
  const { path: tempDir, cleanup } = await createTempDir()
  const originalCwd = Deno.cwd()

  try {
    Deno.chdir(tempDir)

    // Create package.json with TypeScript dependency
    await createTempFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
        },
      }),
    )

    const consoleMock = mockConsole()
    const commandMock = mockDenoCommand()

    try {
      await init()

      // Should detect as TypeScript project
      assert(await exists(join(tempDir, 'hypermix.config.ts')))
      assert(
        consoleMock.logs.calls.some((call) =>
          call.args[0]?.includes('typescript project') &&
          call.args[0]?.includes('package.json with TypeScript')
        ),
      )
    } finally {
      consoleMock.restore()
      commandMock.restore()
    }
  } finally {
    Deno.chdir(originalCwd)
    await cleanup()
  }
})
