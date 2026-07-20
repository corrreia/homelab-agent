import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QuickJsExecutor } from '../src/lib/quickjs-executor.ts'

test('sandbox + host call resolve normally', async () => {
  const executor = new QuickJsExecutor({ timeout: 5000 })
  const result = await executor.execute('async () => { const r = await codemode.echo({ n: 21 }); return r.n * 2 }', {
    echo: async (arg: unknown) => arg as { n: number },
  })
  assert.equal(result.error, undefined)
  assert.equal(result.result, 42)
})

test('a host call that outlives the executor timeout does NOT crash the process (use-after-free guard)', async () => {
  const executor = new QuickJsExecutor({ timeout: 200 })
  let slowSettled = false
  const result = await executor.execute('async () => { return await codemode.slow({}) }', {
    // resolves well after the 200ms executor timeout — the callback fires post-disposal
    slow: async () => {
      await new Promise((r) => setTimeout(r, 700))
      slowSettled = true
      return { ok: true }
    },
  })

  // The run itself timed out fast, not waiting ~700ms for the hung call.
  assert.ok(result.error, 'expected a timeout error')
  assert.match(result.error!, /timed out/i)

  // Now let the slow host call settle AFTER the runtime was disposed. Before the guard,
  // its callback called executePendingJobs() on the freed runtime → QuickJSUseAfterFree,
  // a fatal uncaught exception. If we reach the assertions below, the guard held.
  await new Promise((r) => setTimeout(r, 800))
  assert.equal(slowSettled, true, 'the slow host fn still ran to completion')
})
