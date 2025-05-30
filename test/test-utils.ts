import { assert, assertEquals, assertExists, assertRejects } from '@std/assert'
import { spy } from '@std/testing/mock'
import { join } from '@std/path'
import { exists } from '@std/fs'

export { assert, assertEquals, assertExists, assertRejects, exists, join, spy }

export const createTempDir = async () => {
  const tempDir = await Deno.makeTempDir({ prefix: 'hypermix-test-' })
  return {
    path: tempDir,
    cleanup: async () => {
      try {
        await Deno.remove(tempDir, { recursive: true })
      } catch (error) {
        console.error(`Failed to clean up temp dir ${tempDir}:`, error)
      }
    },
  }
}

export const createTempFile = async (path: string, content: string) => {
  await Deno.writeTextFile(path, content)
  return path
}

export const mockDenoCommand = () => {
  const originalCommand = Deno.Command
  const calls: { command: string; args: string[] }[] = []

  // @ts-ignore overriding built-in
  Deno.Command = class MockCommand {
    constructor(command: string, options: { args: string[] }) {
      calls.push({ command, args: options.args })
    }

    output() {
      return Promise.resolve({
        success: true,
        stdout: new TextEncoder().encode('Success'),
        stderr: new Uint8Array(),
      })
    }
  }

  return {
    calls,
    restore: () => {
      // @ts-ignore restoring built-in
      Deno.Command = originalCommand
    },
  }
}

export const mockConsole = () => {
  const logs = spy(console, 'log')
  const warns = spy(console, 'warn')
  const errors = spy(console, 'error')

  return {
    logs,
    warns,
    errors,
    restore: () => {
      logs.restore()
      warns.restore()
      errors.restore()
    },
  }
}
