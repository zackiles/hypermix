import { join } from '@std/path'

const APP_NAME = 'hypermix'

const CONFIG_NAMES = [
  `${APP_NAME}.config.js`,
  `${APP_NAME}.config.ts`,
  `${APP_NAME}.config.json`,
  `${APP_NAME}.config.jsonc`,
] as const

const BOOLEAN_FLAGS = [
  '--version',
  '--stdout',
  '--parsable-style',
  '--compress',
  '--output-show-line-numbers',
  '--copy',
  '--no-file-summary',
  '--no-directory-structure',
  '--remove-comments',
  '--remove-empty-lines',
  '--include-empty-directories',
  '--include-diffs',
  '--no-git-sort-by-changes',
  '--no-gitignore',
  '--no-default-patterns',
  '--init',
  '--global',
  '--no-security-check',
  '--mcp',
  '--verbose',
  '--quiet',
] as const

const DEFAULT_PATH = join(Deno.cwd(), `.${APP_NAME}`)

const DEFAULT_FLAGS = [
  '--remove-empty-lines',
  '--compress',
  '--quiet',
  '--parsable-style',
] as const

const MAKEFILE_TASKS = {
  [APP_NAME]: APP_NAME,
} as const

const MAKEFILE_SECTION_MARKER = `# ${APP_NAME} build`

const VSCODE_TASK_DEFAULTS = {
  VERSION: '2.0.0',
  TYPE: 'shell',
  ARGS: [],
  PROBLEM_MATCHER: [],
} as const

const NX_EXECUTOR = 'nx:run-commands'

const FORMATTING_OPTIONS = {
  insertSpaces: true,
  tabSize: 2,
} as const

export {
  APP_NAME,
  BOOLEAN_FLAGS,
  CONFIG_NAMES,
  DEFAULT_FLAGS,
  DEFAULT_PATH,
  FORMATTING_OPTIONS,
  MAKEFILE_SECTION_MARKER,
  MAKEFILE_TASKS,
  NX_EXECUTOR,
  VSCODE_TASK_DEFAULTS,
}
