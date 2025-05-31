import { join } from '@std/path'

const APP_NAME = 'hypermix'

const HYPERMIX_CONFIG_NAMES = [
  `${APP_NAME}.config.js`,
  `${APP_NAME}.config.ts`,
  `${APP_NAME}.config.json`,
  `${APP_NAME}.config.jsonc`,
] as const

const REPOMIX_BOOLEAN_FLAGS = [
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
  '--global',
  '--no-security-check',
  '--mcp',
  '--verbose',
  '--quiet',
] as const

const DEFAULT_PATH = join(Deno.cwd(), `.${APP_NAME}`)

const REPOMIX_DEFAULT_FLAGS = [
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
  DEFAULT_PATH,
  FORMATTING_OPTIONS,
  HYPERMIX_CONFIG_NAMES,
  MAKEFILE_SECTION_MARKER,
  MAKEFILE_TASKS,
  NX_EXECUTOR,
  REPOMIX_BOOLEAN_FLAGS,
  REPOMIX_DEFAULT_FLAGS,
  VSCODE_TASK_DEFAULTS,
}
