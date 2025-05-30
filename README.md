# Hypermix

<div align="center">
  <img src="logo.png" alt="Hypermix Logo" height="300">

<div align="center">
    <i>Repomix for agentic power-users</i></br></br>
    <b>Real-time, token-aware, intelligent repomixing of your codebase and all dependencies. Auto-integrations for Cursor, Claude, and Windsurf that maintain the mixes configures rules and a tool for your agent to get the most out of your mixes.</b>
  </div></br>
  <p>
    <a href="https://github.com/zackiles/hypermix/actions/workflows/release-github.yml">
      <img src="https://github.com/zackiles/hypermix/actions/workflows/release-github.yml/badge.svg" alt="Release">
    </a>
  </p>
</div>

## Why

`deno run -A mod.ts [flags]`... and everything is handled for you seamlessly.
Build context files with intelligent token-awareness and code analytics.
Auto-integrates with Cursor, Claude, and other tools for enhanced AI
interactions.

## How

Hypermix uses repomix to build context files for AI tools, automatically
managing integration with various development environments. It supports:

- **Token counting:** Tracks token usage across context files to optimize AI
  context windows
- **Project integration:** Automatically adds tasks to package.json, deno.json,
  Makefiles, and more
- **IDE configuration:** Sets up VS Code tasks and integrates with Cursor
- **Intelligent ignores:** Automatically updates .gitignore, .cursorignore, and
  .cursorignoreindex

> [!TIP]
> Check out some examples of [When To Use It](#when-to-use-it).

## Installation

Run hypermix directly with Deno:

```bash
deno run -A mod.ts [flags]
```

### NPM Installation

You can also install hypermix globally via npm:

```bash
# Install globally
npm install -g hypermix

# Or use directly with npx (no installation required)
npx hypermix
```

When installed via npm, the appropriate binary for your platform will be
downloaded automatically during installation.

## Usage

**Run hypermix with flags:**

```bash
deno run -A mod.ts
```

Builds context files for your codebase and configured repositories, with
intelligent token counting.

**Available flags:**

```
--output-path, -o  Override the default output directory for all context files
                   Example: deno run -A mod.ts --output-path ./custom/path
--silent, -s       Suppress all output except errors
```

The script also passes through flags to the underlying repomix tool, which are
configured in the configs array within the script. These include:

- Repository configurations (remote, include patterns, ignore patterns)
- Output paths for context files
- Repomix configuration options

**Use from your project task runner:**

Once integrated into your project, you can simply run:

```bash
# For npm/yarn projects
npm run hypermix

# For deno projects
deno task hypermix

# For Makefile projects
make hypermix
```

> [!IMPORTANT]
> Your .gitignore and .cursorignore files will be automatically updated to
> handle the generated context files properly.

## Cursor Integration

Hypermix works seamlessly with Cursor IDE:

- Prevents context pollution by configuring .cursorignoreindex
- Ensures context files are accessible when needed with .cursorignore
- Sets up IDE tasks for quick access to hypermix commands

## Token Awareness

Hypermix tracks token usage across all context files:

- Reports token counts per file and total usage
- Warns when files exceed recommended token limits
- Optimizes context files to stay within model token windows
- Provides streaming token counting for large files

## Configuring Mixes

Hypermix builds context by processing a `mixes` array, typically defined in a
`hypermix.config.js/ts` (or `.json/c`) file. Each object in this array defines a
single context-building task. There are two main ways to configure a mix item,
which are mutually exclusive:

### 1. Remote Repository Mix

This type of mix fetches code from a specified remote GitHub repository.

- **`remote`**:
  - **Type**: `string`
  - **Required**: Yes
  - **Description**: The GitHub repository URL in `owner/repo` format (e.g.,
    `denoland/std`).

- **`include`**:
  - **Type**: `string[]`
  - **Required**: No
  - **Description**: An array of glob patterns for files/directories to include
    (e.g., `['src/**/*.ts', 'README.md']`). Defaults to `**/*` (all files).

- **`ignore`**:
  - **Type**: `string[]`
  - **Required**: No
  - **Description**: An array of glob patterns to exclude files/directories
    (e.g., `['**/test_data/**']`).

- **`output`**:
  - **Type**: `string`
  - **Required**: No
  - **Description**: Custom output path for the generated XML file, relative to
    the global `outputPath`. If omitted, a path is derived from the remote URL
    (e.g., `owner/repo.xml`).

- **`extraFlags`**:
  - **Type**: `string[]`
  - **Required**: No
  - **Description**: An array of additional boolean command-line flags to pass
    to `repomix` (e.g., `['--compress']`).

### 2. Local Repomix Configuration Mix

This type of mix uses an existing `repomix.config.json` file to define the
context building rules, typically for your local project codebase.

- **`config`** or **`repomixConfig`**:
  - **Type**: `string`
  - **Required**: Yes
  - **Description**: Path to your `repomix.config.json` file (e.g.,
    `'./repomix.config.json'`).

- **`extraFlags`**:
  - **Type**: `string[]`
  - **Required**: No
  - **Description**: An array of additional boolean command-line flags to pass
    to `repomix` (e.g., `['--quiet']`). Other options like `include`, `ignore`,
    and `output` are typically defined within the referenced
    `repomix.config.json` itself.

### Example `hypermix.config.ts`

Here's how you might structure your `hypermix.config.ts` to include multiple
mixes:

```typescript
// hypermix.config.ts
import { join } from '@std/path' // Or your preferred path joining utility

export default {
  silent: false, // Global option: suppress non-error output
  outputPath: '.hypermix', // Global option: root directory for all generated .xml files
  mixes: [
    // Example of a remote repository mix
    {
      remote: 'denoland/std',
      include: ['fs/**/*.ts'], // Only include files from the fs module
      ignore: ['fs/**/_*.ts', 'fs/**/test*.ts'], // Exclude private and test files
      output: join('@std', 'fs.xml'), // Custom output path
      extraFlags: ['--compress'], // Compress this specific output
    },
    // Another remote mix, simpler configuration
    {
      remote: 'vercel/ai',
      include: ['packages/ai/core/**/*.ts'],
      output: 'vercel-ai-core.xml',
    },
    // Example of a local mix using an existing repomix.config.json
    {
      repomixConfig: './repomix.config.json', // Use local repomix config for the current project
      extraFlags: ['--quiet'], // Pass --quiet to repomix for this local build
    },
    // You can add more remote or local mixes as needed
  ],
}
```

This structure allows for flexible and powerful context aggregation from various
sources into a centralized location, tailored to your project's needs.

## When To Use It

- Enhance AI agent context with comprehensive codebase knowledge
- Optimize token usage across large projects
- Integrate multiple repositories into a unified context
- Provide better context to AI-powered development tools
- Simplify AI integration in complex projects
- Manage context files with intelligent repository mixing

## License

MIT License - see the [LICENSE](LICENSE) file for details.
