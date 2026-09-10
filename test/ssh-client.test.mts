import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import ssh2 from 'ssh2'
import { execCommand, MAX_OUTPUT_CHARS } from '../src/lib/ssh-client.ts'

// An in-process ssh2 Server that "runs" commands by name. Each fake command drives the exec
// channel the way sshd would: writes output, then exit(code) or exit(signal). This exercises
// execCommand's exit-code mapping, output cap, UTF-8 reassembly and kill-on-timeout without
// a real sshd.
const hostKey = ssh2.utils.generateKeyPairSync('ed25519').private
const clientKeys = ssh2.utils.generateKeyPairSync('ed25519')

const signalsReceived: string[] = []

const commands: Record<string, (stream: ssh2.ServerChannel, session: ssh2.Session) => void> = {
  'exit-3': (stream) => {
    stream.write('out\n')
    stream.stderr.write('err\n')
    stream.exit(3)
    stream.end()
  },
  killed: (stream) => {
    stream.exit('KILL', false, '')
    stream.end()
  },
  // 'aé' repeated, sent in chunks that split the two-byte 'é' across packets.
  'utf8-split': (stream) => {
    const bytes = Buffer.from('aé'.repeat(2000), 'utf8')
    for (let i = 0; i < bytes.length; i += 3) stream.write(bytes.subarray(i, i + 3))
    stream.exit(0)
    stream.end()
  },
  flood: (stream) => {
    // Keep writing well past the cap until the client sends a signal (kill) or closes.
    const chunk = 'a'.repeat(8192)
    let bytes = 0
    const timer = setInterval(() => {
      if (stream.destroyed || bytes > MAX_OUTPUT_CHARS * 40) {
        clearInterval(timer)
        return
      }
      bytes += chunk.length
      stream.write(chunk)
    }, 1)
    stream.on('close', () => clearInterval(timer))
  },
  hang: (stream, session) => {
    // Never exits on its own; ends only when signalled, like `sleep infinity`.
    session.on('signal', (accept, _reject, info) => {
      accept?.()
      signalsReceived.push(info.name)
      stream.exit(info.name, false, '')
      stream.end()
    })
  },
}

const server = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
  client.on('authentication', (ctx) => ctx.accept())
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept()
      session.on('exec', (acceptExec, _reject, info) => {
        const stream = acceptExec()
        const fake = commands[info.command]
        if (!fake) {
          stream.stderr.write(`unknown fake command: ${info.command}\n`)
          stream.exit(127)
          stream.end()
          return
        }
        fake(stream, session)
      })
    })
  })
})

let port = 0
before(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  port = server.address().port
})
after(() => server.close())

async function connect(): Promise<ssh2.Client> {
  const conn = new ssh2.Client()
  conn.connect({ host: '127.0.0.1', port, username: 'test', privateKey: clientKeys.private })
  await once(conn, 'ready')
  return conn
}

async function run(command: string, timeoutMs = 5_000) {
  const conn = await connect()
  try {
    return await execCommand(conn, command, timeoutMs)
  } finally {
    conn.end()
  }
}

test('reports exit code, stdout and stderr', async () => {
  const r = await run('exit-3')
  assert.deepEqual(r, { stdout: 'out\n', stderr: 'err\n', exitCode: 3 })
})

test('a signal-terminated process is not reported as success', async () => {
  const r = await run('killed')
  assert.equal(r.signal, 'SIGKILL')
  assert.equal(r.exitCode, 137) // 128 + SIGKILL(9)
})

test('multi-byte UTF-8 split across packets is reassembled', async () => {
  const r = await run('utf8-split')
  assert.equal(r.stdout, 'aé'.repeat(2000))
  assert.ok(!r.stdout.includes('�'))
})

test('output is capped and the flooding process is killed', async () => {
  const r = await run('flood')
  assert.ok(r.stdout.length < MAX_OUTPUT_CHARS + 200, `kept ${r.stdout.length} chars`)
  assert.match(r.stdout, /output capped at \d+ chars; the remote process was sent SIGKILL/)
})

test('timeout rejects and sends SIGKILL to the remote process', async () => {
  signalsReceived.length = 0
  await assert.rejects(run('hang', 200), /timed out after 200ms; the remote process was sent SIGKILL/)
  await new Promise((r) => setTimeout(r, 100))
  assert.deepEqual(signalsReceived, ['KILL'])
})
