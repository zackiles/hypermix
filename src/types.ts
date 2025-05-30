import type { BOOLEAN_FLAGS } from './constants.ts'

type RepomixConfig = {
  remote?: string
  include?: string[]
  ignore?: string[]
  output?: string
  config?: string
  repomixConfig?: string
  extraFlags?: typeof BOOLEAN_FLAGS[number][]
}

type HypermixConfig = {
  mixes: RepomixConfig[]
  silent?: boolean
  outputPath?: string
}

export type { HypermixConfig, RepomixConfig }
