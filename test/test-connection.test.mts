import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { describeFailure, testServiceConnection } from '../src/lib/test-connection.ts'

const fetchFailed = (code: string) =>
  new TypeError('fetch failed', { cause: Object.assign(new Error(`failed: ${code}`), { code }) })

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()

  return address instanceof Object ? address.port : 0
}

test('describeFailure: names the cause instead of guessing from "fetch failed"', () => {
  assert.match(
    describeFailure(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    /No response within 10s/,
  )
  assert.match(
    describeFailure(fetchFailed('DEPTH_ZERO_SELF_SIGNED_CERT')),
    /TLS certificate not trusted .*Allow invalid TLS certs/,
  )
  assert.match(describeFailure(fetchFailed('ECONNREFUSED')), /Connection refused/)
  assert.match(describeFailure(fetchFailed('ENOTFOUND')), /does not resolve/)
  assert.match(describeFailure(fetchFailed('EWHATEVER')), /Connection error: failed: EWHATEVER \(EWHATEVER\)/)
})

test('testServiceConnection: a redirect says where it went', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(302, { location: '/login' })
    res.end()
  })

  const port = await listen(server)

  try {
    const result = await testServiceConnection({
      baseUrl: `http://127.0.0.1:${port}`,
      testPath: '/api',
      auth: { type: 'none' },
    })

    assert.equal(result.status, 302)
    assert.match(result.message, /^Redirected to \/login\./)
  } finally {
    server.close()
  }
})

test('testServiceConnection: a closed port is reported as refused', async () => {
  const probe = createServer()
  const port = await listen(probe)
  probe.close()
  await once(probe, 'close')

  const result = await testServiceConnection({
    baseUrl: `http://127.0.0.1:${port}`,
    testPath: '/',
    auth: { type: 'none' },
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /^Connection refused\./)
})
