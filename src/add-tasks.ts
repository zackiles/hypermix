/**
 * @module add_tasks
 *
 * Manages project task configurations for hypermix across different build systems.
 * Supports adding and removing hypermix tasks in package.json, deno.json,
 * project.json, VS Code tasks.json, and Makefiles.
 *
 * @example
 * ```ts
 * import { addTasksToProjectConfig, detectProjectConfigFile } from "./add-tasks.ts"
 * const configFile = await detectProjectConfigFile("./")
 * if (configFile) {
 *   await addTasksToProjectConfig("./", configFile, { hypermix: "hypermix" })
 * }
 * ```
 */

import { exists } from '@std/fs'
import { basename, join } from '@std/path'
import { applyEdits, modify } from 'jsonc-parser'
import {
  APP_NAME,
  FORMATTING_OPTIONS,
  MAKEFILE_SECTION_MARKER,
  MAKEFILE_TASKS,
  NX_EXECUTOR,
  PROJECT_CONFIG_FILES,
  VSCODE_TASK_DEFAULTS,
} from './constants.ts'

type ProjectConfigFile = typeof PROJECT_CONFIG_FILES[number]
type TaskDefinition = Record<string, string>

const VAULT_TASK_LABELS = Object.values(MAKEFILE_TASKS) as string[]

async function detectProjectConfigFile(
  repoRoot: string,
): Promise<ProjectConfigFile | null> {
  for (const file of PROJECT_CONFIG_FILES) {
    if (await exists(join(repoRoot, file))) return file
  }
  return null
}

async function updateJsonScript(
  file: string,
  section: 'tasks' | 'scripts',
  name: string,
  cmd?: string,
): Promise<boolean> {
  try {
    const src = await Deno.readTextFile(file)
    const edits = modify(src, [section, name], cmd, {
      formattingOptions: FORMATTING_OPTIONS,
    })
    await Deno.writeTextFile(file, applyEdits(src, edits))
    return true
  } catch {
    return false
  }
}

function getTaskDefinition(
  configFileName: ProjectConfigFile,
  hypermixConfigPath?: string,
): TaskDefinition {
  const baseCommand = hypermixConfigPath
    ? `${APP_NAME} --config ${hypermixConfigPath}`
    : APP_NAME
  return configFileName.startsWith('deno.')
    ? { [APP_NAME]: `${baseCommand} $@` }
    : { [APP_NAME]: baseCommand }
}

async function addTasksToProjectConfig(
  repoRoot: string,
  configFileName: ProjectConfigFile,
  task: TaskDefinition,
  hypermixConfigPath?: string,
): Promise<boolean> {
  const configPath = join(repoRoot, configFileName)
  if (!await exists(configPath)) return false

  try {
    if (configFileName === 'Makefile') {
      const content = await Deno.readTextFile(configPath)
      const entries = Object.entries(MAKEFILE_TASKS).map(
        ([target, command]) => {
          const finalCommand = hypermixConfigPath
            ? `${command} --config ${hypermixConfigPath}`
            : command
          return [target, finalCommand]
        },
      )
      const targets = entries.flatMap(([target, command]) => [
        `${target}:`,
        `\t${command} $(filter-out $@,$(MAKECMDGOALS))`,
        '',
      ])
      const updated = [
        content,
        MAKEFILE_SECTION_MARKER,
        ...targets,
        `.PHONY: ${entries.map(([t]) => t).join(' ')}`,
        '',
        '# Allow additional arguments to be passed to make targets',
        '%:',
        '\t@:',
        '',
      ].join('\n')
      await Deno.writeTextFile(configPath, updated)
      return true
    }

    const config = JSON.parse(await Deno.readTextFile(configPath))
    const fileName = basename(configPath)

    if (fileName.startsWith('project.')) {
      config.targets = config.targets || {}
      config.targets[APP_NAME] = {
        executor: NX_EXECUTOR,
        options: { command: task[APP_NAME] },
      }
    } else if (fileName.startsWith('tasks.')) {
      config.tasks = config.tasks || []
      config.version = config.version || VSCODE_TASK_DEFAULTS.VERSION
      config.tasks = config.tasks.filter((task: { label: string }) =>
        !VAULT_TASK_LABELS.includes(task.label)
      )
      const createTask = (label: string, command: string) => ({
        label,
        command,
        type: VSCODE_TASK_DEFAULTS.TYPE,
        args: [...VSCODE_TASK_DEFAULTS.ARGS],
        problemMatcher: [...VSCODE_TASK_DEFAULTS.PROBLEM_MATCHER],
      })
      config.tasks.push(
        createTask(APP_NAME, task[APP_NAME]),
      )
    } else {
      const section = fileName.includes('deno.') ? 'tasks' : 'scripts'
      const result = await updateJsonScript(
        configPath,
        section,
        APP_NAME,
        task[APP_NAME],
      )
      return result
    }

    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2))
    return true
  } catch {
    return false
  }
}

async function removeTasksFromProjectConfig(
  repoRoot: string,
  configFileName: ProjectConfigFile,
  _hypermixConfigPath?: string,
): Promise<boolean> {
  const configPath = join(repoRoot, configFileName)
  if (!await exists(configPath)) return false

  try {
    if (configFileName === 'Makefile') {
      const content = await Deno.readTextFile(configPath)
      const lines = content.split('\n')
      let inSection = false
      const filtered = lines.filter((line, i) => {
        if (line.trim() === MAKEFILE_SECTION_MARKER) {
          inSection = true
          return false
        }
        if (
          inSection && ((line.startsWith('#') && !line.includes(APP_NAME)) ||
            (line.trim() === '' && lines[i + 1]?.trim() === ''))
        ) {
          inSection = false
        }
        return !inSection
      })
      await Deno.writeTextFile(
        configPath,
        filtered.join('\n').replace(/\n\n+$/, '\n'),
      )
      return true
    }

    const config = JSON.parse(await Deno.readTextFile(configPath))
    const fileName = basename(configPath)

    if (fileName.startsWith('project.')) {
      delete config.targets?.[APP_NAME]
    } else if (fileName.startsWith('tasks.')) {
      config.tasks = config.tasks?.filter((task: { label: string }) =>
        !VAULT_TASK_LABELS.includes(task.label)
      ) || []
    } else {
      const section = fileName.includes('deno.') ? 'tasks' : 'scripts'
      const result = await updateJsonScript(
        configPath,
        section,
        APP_NAME,
        undefined,
      )
      return result
    }

    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2))
    return true
  } catch {
    return false
  }
}

export {
  addTasksToProjectConfig,
  detectProjectConfigFile,
  getTaskDefinition,
  removeTasksFromProjectConfig,
  updateJsonScript,
}
export type { ProjectConfigFile, TaskDefinition }
