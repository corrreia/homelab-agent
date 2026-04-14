import vm from 'node:vm'
import type { Executor, ExecuteResult, ResolvedProvider } from './codemode-types'

export class NodeVmExecutor implements Executor {
  private timeout: number

  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout ?? 30_000
  }

  async execute(
    code: string,
    providersOrFns: ResolvedProvider[] | Record<string, (...args: unknown[]) => Promise<unknown>>,
  ): Promise<ExecuteResult> {
    const logs: string[] = []

    const capture = (..._args: unknown[]) => logs.push(_args.map(String).join(' '))

    const sandbox: Record<string, unknown> = {
      console: { log: capture, warn: capture, error: capture },
    }

    if (Array.isArray(providersOrFns)) {
      for (const provider of providersOrFns) {
        sandbox[provider.name] = provider.fns
      }
    } else {
      sandbox.codemode = providersOrFns
    }

    const context = vm.createContext(sandbox)

    try {
      const script = new vm.Script(`(${code})()`)
      const promise = script.runInContext(context)

      const result = await Promise.race([
        promise,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Execution timed out')), this.timeout)),
      ])

      return { result, logs }
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs,
      }
    }
  }
}
