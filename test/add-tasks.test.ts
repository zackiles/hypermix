import {
  assert,
  assertEquals,
  assertExists,
  createTempDir,
  createTempFile,
  join,
} from './test-utils.ts'
import {
  addTasksToProjectConfig,
  detectProjectConfigFile,
  getTaskDefinition,
  ProjectConfigFile,
} from '../src/add-tasks.ts'
import { APP_NAME } from '../src/constants.ts'

Deno.test('detectProjectConfigFile - finds existing configs', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a package.json file
    await createTempFile(join(path, 'package.json'), '{}')

    // Should detect package.json
    const detectedFile = await detectProjectConfigFile(path)
    assertEquals(detectedFile, 'package.json')

    // Create a deno.json file and verify it's detected too
    await createTempFile(join(path, 'deno.json'), '{}')
    const detectedFile2 = await detectProjectConfigFile(path)
    // Test assumes the detection order is as defined in PROJECT_CONFIG_FILES
    // It should find the first one which is package.json
    assertEquals(detectedFile2, 'package.json')
  } finally {
    await cleanup()
  }
})

Deno.test('detectProjectConfigFile - returns null for no configs', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Empty directory, no config files
    const detectedFile = await detectProjectConfigFile(path)
    assertEquals(detectedFile, null)
  } finally {
    await cleanup()
  }
})

Deno.test('getTaskDefinition - returns correct definitions', () => {
  // Default task without config path
  const defaultTask = getTaskDefinition('package.json')
  assertEquals(defaultTask[APP_NAME], APP_NAME)

  // Task with config path for deno.json includes $@
  const configPath = './custom/config.json'
  const taskWithConfig = getTaskDefinition('deno.json', configPath)
  assertEquals(
    taskWithConfig[APP_NAME],
    `${APP_NAME} --config ${configPath} $@`,
  )

  // Deno tasks include $@ parameter
  const denoTask = getTaskDefinition('deno.json')
  assert(denoTask[APP_NAME].includes('$@'))
})

Deno.test('addTasksToProjectConfig - adds to package.json', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a package.json file
    const packageJsonPath = join(path, 'package.json')
    await createTempFile(
      packageJsonPath,
      JSON.stringify(
        {
          name: 'test-package',
          scripts: {
            test: 'echo "test"',
          },
        },
        null,
        2,
      ),
    )

    // Add task
    const task = getTaskDefinition('package.json')
    const result = await addTasksToProjectConfig(path, 'package.json', task)

    // Verify task was added
    assert(result, 'Task should be added successfully')

    // Check file content
    const content = JSON.parse(await Deno.readTextFile(packageJsonPath))
    assertEquals(content.scripts[APP_NAME], APP_NAME)
    assertEquals(content.scripts.test, 'echo "test"')
  } finally {
    await cleanup()
  }
})

Deno.test('addTasksToProjectConfig - adds to deno.json', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a deno.json file
    const denoJsonPath = join(path, 'deno.json')
    await createTempFile(
      denoJsonPath,
      JSON.stringify(
        {
          tasks: {
            test: 'deno test',
          },
        },
        null,
        2,
      ),
    )

    // Add task
    const task = getTaskDefinition('deno.json')
    const result = await addTasksToProjectConfig(path, 'deno.json', task)

    // Verify task was added
    assert(result, 'Task should be added successfully')

    // Check file content
    const content = JSON.parse(await Deno.readTextFile(denoJsonPath))
    assertEquals(content.tasks[APP_NAME], `${APP_NAME} $@`)
    assertEquals(content.tasks.test, 'deno test')
  } finally {
    await cleanup()
  }
})

Deno.test('addTasksToProjectConfig - adds to Makefile', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a Makefile
    const makefilePath = join(path, 'Makefile')
    await createTempFile(makefilePath, 'test:\n\techo "test"\n')

    // Add task
    const task = getTaskDefinition('Makefile')
    const result = await addTasksToProjectConfig(path, 'Makefile', task)

    // Verify task was added
    assert(result, 'Task should be added successfully')

    // Check file content
    const content = await Deno.readTextFile(makefilePath)
    assert(content.includes(`${APP_NAME}:`))
    assert(content.includes(`\t${APP_NAME}`))
    assert(content.includes('.PHONY:'))
  } finally {
    await cleanup()
  }
})

Deno.test('addTasksToProjectConfig - adds to VSCode tasks.json', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Create a tasks.json file
    const tasksJsonPath = join(path, 'tasks.json')
    await createTempFile(
      tasksJsonPath,
      JSON.stringify(
        {
          version: '2.0.0',
          tasks: [
            {
              label: 'test',
              command: 'echo',
              args: ['test'],
              type: 'shell',
            },
          ],
        },
        null,
        2,
      ),
    )

    // Add task
    const task = getTaskDefinition('tasks.json')
    const result = await addTasksToProjectConfig(path, 'tasks.json', task)

    // Verify task was added
    assert(result, 'Task should be added successfully')

    // Check file content
    const content = JSON.parse(await Deno.readTextFile(tasksJsonPath))
    assertEquals(content.tasks.length, 2)
    const addedTask = content.tasks.find((t: { label: string }) =>
      t.label === APP_NAME
    )
    assertExists(addedTask)
    assertEquals(addedTask.command, APP_NAME)
  } finally {
    await cleanup()
  }
})

Deno.test('addTasksToProjectConfig - handles non-existent files', async () => {
  const { path, cleanup } = await createTempDir()

  try {
    // Try to add to a non-existent file
    const task = getTaskDefinition('package.json')
    const result = await addTasksToProjectConfig(path, 'package.json', task)

    // Should return false for non-existent files
    assertEquals(result, false)
  } finally {
    await cleanup()
  }
})
