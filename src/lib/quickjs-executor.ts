import { getQuickJS } from 'quickjs-emscripten'
import type { QuickJSContext, QuickJSDeferredPromise, QuickJSHandle } from 'quickjs-emscripten'
import type { Executor, ExecuteResult, ResolvedProvider } from './codemode-types'

type FnMap = Record<string, (...args: unknown[]) => Promise<unknown>>

export class QuickJsExecutor implements Executor {
  private timeout: number
  private memoryLimitBytes: number
  private stackSizeBytes: number

  constructor(options?: { timeout?: number; memoryLimitBytes?: number; stackSizeBytes?: number }) {
    this.timeout = options?.timeout ?? 30_000
    this.memoryLimitBytes = options?.memoryLimitBytes ?? 32 * 1024 * 1024
    this.stackSizeBytes = options?.stackSizeBytes ?? 512 * 1024
  }

  async execute(
    code: string,
    providersOrFns: ResolvedProvider[] | Record<string, (...args: unknown[]) => Promise<unknown>>,
  ): Promise<ExecuteResult> {
    const logs: string[] = []
    const QuickJS = await getQuickJS()
    const runtime = QuickJS.newRuntime()
    const deadline = Date.now() + this.timeout
    runtime.setMemoryLimit(this.memoryLimitBytes)
    runtime.setMaxStackSize(this.stackSizeBytes)
    runtime.setInterruptHandler(() => Date.now() > deadline)

    const vm = runtime.newContext()
    const deferreds: QuickJSDeferredPromise[] = []

    try {
      this.installConsole(vm, logs)
      const providers = Array.isArray(providersOrFns)
        ? providersOrFns
        : [{ name: 'codemode', fns: providersOrFns, positionalArgs: false }]
      for (const provider of providers) {
        this.installProvider(vm, provider.name, provider.fns, provider.positionalArgs ?? false, deferreds)
      }

      const result = vm.evalCode(`Promise.resolve((${code})())`)
      const promiseHandle = vm.unwrapResult(result)
      try {
        const resolved = await this.withTimeout(vm.resolvePromise(promiseHandle))
        const valueHandle = vm.unwrapResult(resolved)
        try {
          return { result: vm.dump(valueHandle), logs }
        } finally {
          valueHandle.dispose()
        }
      } finally {
        promiseHandle.dispose()
      }
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs,
      }
    } finally {
      for (const deferred of deferreds) {
        if (deferred.alive) deferred.dispose()
      }
      vm.dispose()
      runtime.dispose()
    }
  }

  private installConsole(vm: QuickJSContext, logs: string[]): void {
    const consoleHandle = vm.newObject()
    const logHandle = vm.newFunction('log', (...args) => {
      logs.push(args.map((arg) => String(vm.dump(arg))).join(' '))
      return vm.undefined
    })
    vm.setProp(consoleHandle, 'log', logHandle)
    vm.setProp(consoleHandle, 'warn', logHandle)
    vm.setProp(consoleHandle, 'error', logHandle)
    vm.setProp(vm.global, 'console', consoleHandle)
    logHandle.dispose()
    consoleHandle.dispose()
  }

  private installProvider(
    vm: QuickJSContext,
    name: string,
    fns: FnMap,
    positionalArgs: boolean,
    deferreds: QuickJSDeferredPromise[],
  ): void {
    const providerHandle = vm.newObject()
    for (const [fnName, fn] of Object.entries(fns)) {
      const fnHandle = vm.newFunction(fnName, (...args) => {
        const nativeArgs = positionalArgs ? args.map((arg) => vm.dump(arg)) : [vm.dump(args[0] ?? vm.undefined)]
        const deferred = vm.newPromise()
        deferreds.push(deferred)
        Promise.resolve(fn(...nativeArgs))
          .then((result) => {
            const handle = this.toHandle(vm, result)
            deferred.resolve(handle)
            handle.dispose()
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            const handle = vm.newString(message)
            deferred.reject(handle)
            handle.dispose()
          })
          .finally(() => {
            vm.runtime.executePendingJobs()
          })
        return deferred.handle
      })
      vm.setProp(providerHandle, fnName, fnHandle)
      fnHandle.dispose()
    }
    vm.setProp(vm.global, name, providerHandle)
    providerHandle.dispose()
  }

  private toHandle(vm: QuickJSContext, value: unknown): QuickJSHandle {
    if (value === undefined) return vm.undefined
    const json = JSON.stringify(value)
    if (json === undefined) return vm.undefined
    const result = vm.evalCode(`(${json})`)
    return vm.unwrapResult(result)
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Execution timed out')), this.timeout)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
