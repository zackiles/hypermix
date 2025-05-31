import { assertEquals } from '@std/assert'
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { ensureDir } from '@std/fs'
import { join } from '@std/path'

const TEST_DIR = join(Deno.cwd(), 'test-temp')
// Get the main script path dynamically
const MAIN_SCRIPT = new URL('../src/mod.ts', import.meta.url).pathname

async function runCommand(
  args: string[],
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', MAIN_SCRIPT, ...args],
    stdin: stdin ? 'piped' : undefined,
    stdout: 'piped',
    stderr: 'piped',
  })

  const process = cmd.spawn()

  if (stdin && process.stdin) {
    const writer = process.stdin.getWriter()
    await writer.write(new TextEncoder().encode(stdin))
    await writer.close()
  }

  const { code, stdout, stderr } = await process.output()

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  }
}

describe('hypermix add command', () => {
  beforeEach(async () => {
    await ensureDir(TEST_DIR)
    await Deno.chdir(TEST_DIR)
  })

  afterEach(async () => {
    await Deno.chdir('..')
    await Deno.remove(TEST_DIR, { recursive: true })
  })

  it('should error when no repository identifier is provided', async () => {
    const result = await runCommand(['add'])
    assertEquals(result.code, 1)
    assertEquals(result.stderr.includes('Missing repository identifier'), true)
  })

  it('should error when no config file exists', async () => {
    const result = await runCommand(['add', 'denoland/deno'])
    assertEquals(result.code, 1)
    assertEquals(result.stderr.includes('No hypermix config file found'), true)
  })

  it('should add repository to JSON config file', async () => {
    // Create a simple JSON config
    const config = {
      mixes: [
        {
          remote: 'existing/repo',
          include: ['*.ts'],
          output: 'existing/repo.xml',
        },
      ],
    }
    await Deno.writeTextFile(
      'hypermix.config.json',
      JSON.stringify(config, null, 2),
    )

    // Add a new repository
    const result = await runCommand(['add', 'denoland/deno'], 'n\n')
    assertEquals(result.code, 0)

    // Verify the config was updated
    const updatedConfig = JSON.parse(
      await Deno.readTextFile('hypermix.config.json'),
    )
    assertEquals(updatedConfig.mixes.length, 2)
    assertEquals(updatedConfig.mixes[1].remote, 'denoland/deno')
    assertEquals(updatedConfig.mixes[1].include, ['*.ts', '*.js', '*.md'])
    assertEquals(updatedConfig.mixes[1].output, 'denoland/deno.xml')
  })

  it('should add repository to TypeScript config file', async () => {
    // Create a simple TS config
    const tsConfig = `export default {
  mixes: [
    {
      remote: 'existing/repo',
      include: ['*.ts'],
      output: 'existing/repo.xml',
    },
  ],
}`
    await Deno.writeTextFile('hypermix.config.ts', tsConfig)

    // Add a new repository
    const result = await runCommand(['add', 'denoland/deno'], 'n\n')
    assertEquals(result.code, 0)

    // Verify the config was updated
    const updatedConfig = await Deno.readTextFile('hypermix.config.ts')
    assertEquals(updatedConfig.includes('denoland/deno'), true)
    assertEquals(updatedConfig.includes('["*.ts","*.js","*.md"]'), true)
  })

  it('should handle full GitHub URLs', async () => {
    const config = { mixes: [] }
    await Deno.writeTextFile(
      'hypermix.config.json',
      JSON.stringify(config, null, 2),
    )

    const result = await runCommand(
      ['add', 'https://github.com/denoland/deno'],
      'n\n',
    )
    assertEquals(result.code, 0)

    const updatedConfig = JSON.parse(
      await Deno.readTextFile('hypermix.config.json'),
    )
    assertEquals(updatedConfig.mixes[0].remote, 'denoland/deno')
  })

  it('should warn when repository already exists', async () => {
    const config = {
      mixes: [
        {
          remote: 'denoland/deno',
          include: ['*.ts'],
          output: 'denoland/deno.xml',
        },
      ],
    }
    await Deno.writeTextFile(
      'hypermix.config.json',
      JSON.stringify(config, null, 2),
    )

    const result = await runCommand(['add', 'denoland/deno'])
    assertEquals(result.code, 0)
    // Warning messages go to stderr when using console.warn
    const combinedOutput = result.stdout + result.stderr
    assertEquals(combinedOutput.includes('already exists'), true)
  })

  it('should respect --silent flag', async () => {
    const config = { mixes: [] }
    await Deno.writeTextFile(
      'hypermix.config.json',
      JSON.stringify(config, null, 2),
    )

    const result = await runCommand(['add', 'denoland/deno', '--silent'], 'n\n')
    assertEquals(result.code, 0)
    // With silent flag, stdout should be minimal
    assertEquals(result.stdout.length < 100, true)
  })
})
