import { join } from '@std/path'

export default {
  silent: false,
  outputPath: '.hypermix',
  mixes: [
    { remote: 'vercel/ai', include: ['packages/ai/core/**/*.ts'] },
    { remote: 'YieldRay/json-rpc-ts', include: ['src/**/*.ts'] },
    {
      remote: 'openai/openai-node',
      include: ['src/examples/**/*.ts'],
      output: join('openai', 'sdk-examples.xml'),
    },
    {
      remote: 'openai/openai-node',
      include: ['src/**/*.ts', 'api.md', 'README.md'],
      output: join('openai', 'sdk.xml'),
    },
    {
      remote: 'anthropics/anthropic-sdk-typescript',
      include: ['examples/**/**'],
      output: join('anthropics', 'sdk-examples.xml'),
    },
    {
      remote: 'anthropics/anthropic-sdk-typescript',
      include: ['src/**/**', 'api.md', 'README.md'],
      output: join('anthropics', 'sdk.xml'),
    },
    {
      remote: 'denoland/std',
      include: ['testing/**/*'],
      ignore: ['testing/tests/**', 'testing/mocks/**'],
      output: join('@std', 'testing.xml'),
    },
    { repomixConfig: join('repomix.config.json'), extraFlags: ['--quiet'] },
  ],
}
