import { assert, assertEquals, mockConsole } from './test-utils.ts'
import { parseArgs } from '@std/cli/parse-args'
import { DEFAULT_PATH } from '../src/constants.ts'

// Test parseArgs directly as we can't easily access the private main function
Deno.test('parseArgs - parses output-path flag', () => {
  const args = parseArgs(['--output-path', './custom-path'], {
    string: ['output-path'],
    alias: {
      'output-path': ['outputPath', 'o'],
    },
  })

  assertEquals(args['output-path'], './custom-path')
})

Deno.test('parseArgs - parses aliases correctly', () => {
  // Test using the short alias
  const shortArgs = parseArgs(['-o', './custom-path'], {
    string: ['output-path'],
    alias: {
      'output-path': ['outputPath', 'o'],
    },
  })

  assertEquals(shortArgs['output-path'], './custom-path')

  // Test using the camelCase alias
  const camelArgs = parseArgs(['--outputPath', './custom-path'], {
    string: ['output-path'],
    alias: {
      'output-path': ['outputPath', 'o'],
    },
  })

  assertEquals(camelArgs['output-path'], './custom-path')
})

Deno.test('parseArgs - parses silent flag', () => {
  const args = parseArgs(['--silent'], {
    boolean: ['silent'],
    alias: {
      silent: ['s'],
    },
  })

  assertEquals(args.silent, true)

  // Test short form
  const shortArgs = parseArgs(['-s'], {
    boolean: ['silent'],
    alias: {
      silent: ['s'],
    },
  })

  assertEquals(shortArgs.silent, true)
})

Deno.test('parseArgs - parses config flag', () => {
  const args = parseArgs(['--config', './custom-config.js'], {
    string: ['config'],
    alias: {
      config: ['c'],
    },
  })

  assertEquals(args.config, './custom-config.js')
})

Deno.test('parseArgs - handles all flags together', () => {
  const args = parseArgs([
    '--output-path',
    './custom-path',
    '--silent',
    '--config',
    './custom-config.js',
  ], {
    string: ['output-path', 'config'],
    boolean: ['silent'],
    alias: {
      'output-path': ['outputPath', 'o'],
      silent: ['s'],
      config: ['c'],
    },
  })

  assertEquals(args['output-path'], './custom-path')
  assertEquals(args.silent, true)
  assertEquals(args.config, './custom-config.js')
})

// Test silent mode suppresses output
Deno.test('silent mode - suppresses console output', () => {
  const consoleMock = mockConsole()

  try {
    // Create a simple logger that respects silent flag
    const createLogger = (silent: boolean) => ({
      log: (...args: unknown[]) => !silent && console.log(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    })

    // Test with silent = false first
    const normalLogger = createLogger(false)
    normalLogger.log('This should be logged')
    normalLogger.warn('This warning should be logged')
    normalLogger.error('This error should be logged')

    const normalLogCalls = consoleMock.logs.calls.length
    const normalWarnCalls = consoleMock.warns.calls.length
    const normalErrorCalls = consoleMock.errors.calls.length

    assert(normalLogCalls > 0, 'Normal logger should call console.log')
    assert(normalWarnCalls > 0, 'Normal logger should call console.warn')
    assert(normalErrorCalls > 0, 'Normal logger should call console.error')

    // Test with silent = true
    const silentLogger = createLogger(true)
    silentLogger.log('This should NOT be logged')
    silentLogger.warn('This warning should be logged even in silent mode')
    silentLogger.error('This error should be logged even in silent mode')

    // Verify logs didn't increase (silent mode blocks console.log)
    assertEquals(
      consoleMock.logs.calls.length,
      normalLogCalls,
      'Silent logger should not call console.log',
    )

    // Verify warnings and errors still increased
    assert(
      consoleMock.warns.calls.length > normalWarnCalls,
      'Silent logger should still call console.warn',
    )
    assert(
      consoleMock.errors.calls.length > normalErrorCalls,
      'Silent logger should still call console.error',
    )
  } finally {
    consoleMock.restore()
  }
})

// Test path resolution
Deno.test('path resolution - uses default path when not specified', () => {
  const args = parseArgs([], {
    string: ['output-path'],
    alias: {
      'output-path': ['outputPath', 'o'],
    },
  })

  // In the actual code, it would fall back to DEFAULT_PATH
  assertEquals(args['output-path'], undefined)
  assert(DEFAULT_PATH !== undefined, 'DEFAULT_PATH should be defined')
})

// Test handling multiple arguments
Deno.test('parseArgs - handles positional arguments', () => {
  const args = parseArgs(['file1.js', 'file2.js', '--silent'], {
    boolean: ['silent'],
    alias: {
      silent: ['s'],
    },
  })

  assertEquals(args._, ['file1.js', 'file2.js'])
  assertEquals(args.silent, true)
})
