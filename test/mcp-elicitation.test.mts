import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMutatingMethod, confirmWrite, emitProgress, __resetRunStateForTests } from '../src/lib/mcp-elicitation.ts'

// A stand-in for RequestHandlerExtra. `sendRequest` / `sendNotification` are stubbed
// so we can assert what the host tried to send the client. Every call within one
// "run" shares one context object (that identity is the per-run key), so tests reuse
// the same object to simulate multiple sandbox calls in a single execute run.
function makeContext(opts: {
  elicitReply?: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }
  elicitThrows?: boolean
  progressToken?: string | number
}) {
  const sentRequests: Array<{ method: string; params: unknown }> = []
  const notifications: Array<{ method: string; params: unknown }> = []
  const context = {
    signal: new AbortController().signal,
    _meta: opts.progressToken === undefined ? undefined : { progressToken: opts.progressToken },
    requestId: 1,
    sendRequest: async (req: { method: string; params: unknown }) => {
      sentRequests.push(req)
      if (opts.elicitThrows) throw new Error('timeout')
      return opts.elicitReply ?? { action: 'decline' }
    },
    sendNotification: async (n: { method: string; params: unknown }) => {
      notifications.push(n)
    },
  }
  return { context, sentRequests, notifications }
}

test('isMutatingMethod flags writes, not reads', () => {
  for (const m of ['POST', 'put', 'Patch', 'DELETE']) assert.equal(isMutatingMethod(m), true, m)
  for (const m of ['GET', 'head', 'OPTIONS']) assert.equal(isMutatingMethod(m), false, m)
})

test('accept grants once per run, per source — second write to same source does not re-prompt', async () => {
  __resetRunStateForTests()
  const warnings: string[] = []
  const { context, sentRequests } = makeContext({ elicitReply: { action: 'accept', content: { approve: true } } })

  const first = await confirmWrite(context as never, 'sonarr', 'DELETE', '/series/1', true, (m) => warnings.push(m))
  const second = await confirmWrite(context as never, 'sonarr', 'POST', '/series', true, (m) => warnings.push(m))

  assert.equal(first, true)
  assert.equal(second, true)
  assert.equal(sentRequests.length, 1, 'only one elicitation for two writes to the same source')
  assert.equal(sentRequests[0]!.method, 'elicitation/create')
})

test('decline denies the write and is cached (no re-prompt) for that source in the run', async () => {
  __resetRunStateForTests()
  const { context, sentRequests } = makeContext({ elicitReply: { action: 'decline' } })

  const first = await confirmWrite(context as never, 'radarr', 'DELETE', '/movie/9', true, () => {})
  const second = await confirmWrite(context as never, 'radarr', 'DELETE', '/movie/10', true, () => {})

  assert.equal(first, false)
  assert.equal(second, false)
  assert.equal(sentRequests.length, 1, 'denial cached — no second prompt')
})

test('accept without approve:true is treated as denial', async () => {
  __resetRunStateForTests()
  const { context } = makeContext({ elicitReply: { action: 'accept', content: { approve: false } } })
  assert.equal(await confirmWrite(context as never, 'unifi', 'POST', '/x', true, () => {}), false)
})

test('elicitation error (timeout/cancel) denies the write', async () => {
  __resetRunStateForTests()
  const { context } = makeContext({ elicitThrows: true })
  assert.equal(await confirmWrite(context as never, 'immich', 'DELETE', '/asset/1', true, () => {}), false)
})

test('no elicitation support: fail open, warn once', async () => {
  __resetRunStateForTests()
  const warnings: string[] = []
  const { context, sentRequests } = makeContext({})

  const first = await confirmWrite(context as never, 'portainer', 'POST', '/a', false, (m) => warnings.push(m))
  const second = await confirmWrite(context as never, 'portainer', 'DELETE', '/b', false, (m) => warnings.push(m))

  assert.equal(first, true)
  assert.equal(second, true)
  assert.equal(sentRequests.length, 0, 'never prompts a client that cannot elicit')
  assert.equal(warnings.length, 1, 'warns once per source per run')
})

test('emitProgress sends a notification only when the client supplied a progressToken', async () => {
  __resetRunStateForTests()
  const withToken = makeContext({ progressToken: 'tok-1' })
  emitProgress(withToken.context as never, 'DELETE sonarr/series/1')
  emitProgress(withToken.context as never, 'POST sonarr/series')
  await Promise.resolve()
  assert.equal(withToken.notifications.length, 2)
  assert.equal(withToken.notifications[0]!.method, 'notifications/progress')
  assert.deepEqual((withToken.notifications[1]!.params as { progress: number }).progress, 2, 'incrementing count')

  const noToken = makeContext({})
  emitProgress(noToken.context as never, 'GET jellyfin/items')
  await Promise.resolve()
  assert.equal(noToken.notifications.length, 0, 'no token → no progress notifications')
})
