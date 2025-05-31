import { ensureDir, exists, expandGlob } from '@std/fs'
import { basename, dirname, join, relative } from '@std/path'
import { APP_NAME, CURSOR_RULE_TEMPLATE } from './constants.ts'

type ProjectType = 'typescript' | 'javascript' | 'unknown'

interface ProjectTest {
  name: string
  test: () => Promise<boolean>
  type: ProjectType
}

async function detectProjectType(): Promise<ProjectType> {
  const tests: ProjectTest[] = [
    {
      name: 'TypeScript config files',
      test: async () => {
        for (const file of ['tsconfig.json', 'deno.json', 'deno.jsonc']) {
          if (await exists(join(Deno.cwd(), file))) {
            const content = await Deno.readTextFile(join(Deno.cwd(), file))
            if (
              file.startsWith('tsconfig') || content.includes('compilerOptions')
            ) {
              return true
            }
          }
        }
        return false
      },
      type: 'typescript',
    },
    {
      name: 'TypeScript files',
      test: async () => {
        for await (
          const entry of expandGlob('**/*.{ts,tsx}', {
            root: Deno.cwd(),
            exclude: ['node_modules', '.git', 'dist', 'build'],
            globstar: true,
          })
        ) {
          if (entry.isFile) return true
        }
        return false
      },
      type: 'typescript',
    },
    {
      name: 'package.json with TypeScript',
      test: async () => {
        const pkgPath = join(Deno.cwd(), 'package.json')
        if (await exists(pkgPath)) {
          const content = await Deno.readTextFile(pkgPath)
          const pkg = JSON.parse(content)
          return !!(
            pkg.devDependencies?.typescript ||
            pkg.dependencies?.typescript ||
            pkg.devDependencies?.['@types/node']
          )
        }
        return false
      },
      type: 'typescript',
    },
    {
      name: 'JavaScript files',
      test: async () => {
        for await (
          const entry of expandGlob('**/*.{js,jsx,mjs,cjs}', {
            root: Deno.cwd(),
            exclude: ['node_modules', '.git', 'dist', 'build'],
            globstar: true,
          })
        ) {
          if (entry.isFile) return true
        }
        return false
      },
      type: 'javascript',
    },
  ]

  for (const { name, test, type } of tests) {
    try {
      if (await test()) {
        console.log(`✓ Detected ${type} project (${name})`)
        return type
      }
    } catch (error) {
      console.warn(`Failed to run test "${name}":`, error)
    }
  }

  return 'unknown'
}

async function getConfigFileName(): Promise<string> {
  const projectType = await detectProjectType()

  if (projectType === 'typescript') {
    return 'hypermix.config.ts'
  } else if (projectType === 'javascript') {
    return 'hypermix.config.js'
  }

  return 'hypermix.config.json'
}

async function writeHypermixConfig(configPath: string): Promise<void> {
  const isJson = configPath.endsWith('.json')
  const isTs = configPath.endsWith('.ts')

  let content: string

  if (isJson) {
    content = JSON.stringify(
      {
        output: '.hypermix',
        mixes: {},
      },
      null,
      2,
    )
  } else {
    const exportStatement = isTs ? 'export default' : 'module.exports ='

    content = `${exportStatement} {
  output: '.hypermix',
  mixes: {},
}
`
  }

  await Deno.writeTextFile(configPath, content)
}

async function checkAndInstallRepomix(): Promise<void> {
  // Check if repomix is available in PATH
  try {
    const command = new Deno.Command('repomix', {
      args: ['--version'],
      stdout: 'null',
      stderr: 'null',
    })
    const { success } = await command.output()

    if (success) {
      console.log('✓ Repomix is already installed')
      return
    }
  } catch {
    // Command not found
  }

  console.log('Installing repomix...')

  // Detect package manager
  const hasDeno = await exists(join(Deno.cwd(), 'deno.json')) ||
    await exists(join(Deno.cwd(), 'deno.jsonc'))
  const hasPackageJson = await exists(join(Deno.cwd(), 'package.json'))

  let installCommand: string[]

  if (hasDeno) {
    installCommand = ['deno', 'add', 'npm:repomix']
  } else if (hasPackageJson) {
    installCommand = ['npm', 'install', 'repomix', '--save-dev']
  } else {
    console.warn(
      'No package manager detected. Please install repomix manually.',
    )
    return
  }

  const command = new Deno.Command(installCommand[0], {
    args: installCommand.slice(1),
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const { success } = await command.output()

  if (success) {
    console.log('✓ Repomix installed successfully')
  } else {
    console.warn('Failed to install repomix. Please install it manually.')
  }
}

async function findSourceFolders(): Promise<string[]> {
  const excludeFolders = new Set([
    'test',
    'tests',
    '__tests__',
    'spec',
    'bin',
    'scripts',
    '.bin',
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.hypermix',
  ])

  const sourceFolders = new Set<string>()

  for await (
    const entry of expandGlob('**/*.{ts,tsx,js,jsx,mjs,cjs}', {
      root: Deno.cwd(),
      exclude: Array.from(excludeFolders),
      globstar: true,
    })
  ) {
    if (entry.isFile) {
      const relativePath = relative(Deno.cwd(), entry.path)
      const parts = relativePath.split('/')

      if (parts.length > 1) {
        const topFolder = parts[0]
        if (!excludeFolders.has(topFolder)) {
          sourceFolders.add(topFolder)
        }
      }
    }
  }

  return Array.from(sourceFolders).sort()
}

async function updateHypermixConfigWithMixes(
  configPath: string,
): Promise<void> {
  const isJson = configPath.endsWith('.json')
  const repomixConfigPath = 'repomix.config.json'

  const mixEntry = {
    repomixConfig: repomixConfigPath,
    extraFlags: [],
  }

  if (isJson) {
    const content = await Deno.readTextFile(configPath)
    const config = JSON.parse(content)
    config.mixes = { main: mixEntry }
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2))
  } else {
    const content = await Deno.readTextFile(configPath)

    const newContent = content.replace(
      /mixes:\s*{\s*}/,
      `mixes: {
    main: {
      repomixConfig: '${repomixConfigPath}',
      extraFlags: [],
    },
  }`,
    )

    await Deno.writeTextFile(configPath, newContent)
  }
}

async function writeRepomixConfig(sourceFolders: string[]): Promise<void> {
  const includes = sourceFolders.map((folder) => `${folder}/**/*`)

  const config = {
    output: {
      include: includes,
    },
  }

  await Deno.writeTextFile(
    'repomix.config.json',
    JSON.stringify(config, null, 2),
  )
}

async function copyCursorRule(outputFile: string): Promise<void> {
  const cursorRulePath = join(
    Deno.cwd(),
    '.cursor',
    'rules',
    'hypermix',
    'cursor-rule.mdx',
  )
  await ensureDir(dirname(cursorRulePath))

  let content = CURSOR_RULE_TEMPLATE

  // Replace the globs in the frontmatter and body
  content = content.replace(
    'globs: {repomix_files_list}',
    `globs: ${outputFile}`,
  )

  // Replace template strings in the body
  content = content.replace(
    '{repomix_files_list}',
    outputFile,
  )

  // Write the file
  await Deno.writeTextFile(cursorRulePath, content)
}

async function init(): Promise<void> {
  console.log(`Initializing ${APP_NAME} project...`)

  // 1. Determine config file name and write initial config
  const configFileName = await getConfigFileName()
  const configPath = join(Deno.cwd(), configFileName)

  if (await exists(configPath)) {
    console.log(`✓ Found existing ${configFileName}`)
  } else {
    await writeHypermixConfig(configPath)
    console.log(`✓ Created ${configFileName}`)
  }

  // 2. Check and install repomix if needed
  await checkAndInstallRepomix()

  // 3. Create .hypermix directory
  const hypermixDir = join(Deno.cwd(), '.hypermix')
  await ensureDir(hypermixDir)
  console.log('✓ Created .hypermix directory')

  // 4. Find source folders and create repomix config
  const sourceFolders = await findSourceFolders()

  if (sourceFolders.length > 0) {
    console.log(`✓ Found source folders: ${sourceFolders.join(', ')}`)

    // Update hypermix config with mixes
    await updateHypermixConfigWithMixes(configPath)

    // Write repomix config
    await writeRepomixConfig(sourceFolders)
    console.log('✓ Created repomix.config.json')
  } else {
    console.warn(
      '⚠ No source folders found. Please configure repomix.config.json manually.',
    )
  }

  // 5. Copy cursor rule template
  const outputFile = `${basename(Deno.cwd())}-main-repomix.xml`
  await copyCursorRule(outputFile)
  console.log('✓ Created .cursor/rules/hypermix/cursor-rule.mdx')

  // 6. Success message
  console.log(`
✨ ${APP_NAME} is now set up!

You can now edit:
- ${configFileName} - Configure hypermix settings
- repomix.config.json - Configure source file inclusion

Run '${APP_NAME}' to generate your project mixes.
`)
}

export { init }
