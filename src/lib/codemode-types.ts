// Re-export the types we need from @cloudflare/codemode
// These match the Executor interface from the codemode SDK

export interface ExecuteResult {
  result: unknown
  error?: string
  logs?: string[]
}

export interface ResolvedProvider {
  name: string
  fns: Record<string, (...args: unknown[]) => Promise<unknown>>
  positionalArgs?: boolean
}

export interface Executor {
  execute(
    code: string,
    providersOrFns: ResolvedProvider[] | Record<string, (...args: unknown[]) => Promise<unknown>>,
  ): Promise<ExecuteResult>
}
