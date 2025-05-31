function getLogger() {
  const silent = Deno.args.includes('--silent') || Deno.args.includes('-s')
  const debug = Deno.env.get('DEBUG')
  return {
    log: (...args: unknown[]) => !silent && console.log(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
    debug: (...args: unknown[]) =>
      !silent && debug && console.log('[DEBUG]', ...args),
  }
}

export const logger = getLogger()
