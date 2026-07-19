import { createHash } from 'node:crypto'
import ssh2 from 'ssh2'
import type { Host } from './hosts-repo'
import { getAgentPrivateKey, getHost, setHostKey } from './hosts-repo'
import { applyEdit, buildFindCommand, buildGrepCommand, classifyHostKey, formatNumberedLines } from './ssh-helpers'

const { Client } = ssh2

const CONNECT_TIMEOUT_MS = 15_000
export const DEFAULT_EXEC_TIMEOUT_MS = 120_000
const MAX_OUTPUT_CHARS = 30_000 // ~6k tokens; keeps a runaway `cat` from flooding context.
const TMP_SUFFIX = '.homelab-agent.tmp'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

function fingerprint(hostKey: Buffer): string {
  return createHash('sha256').update(hostKey).digest('base64')
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + `\n… [truncated ${text.length - MAX_OUTPUT_CHARS} more chars]`
}

/** Resolve a host slug or throw a model-actionable error. */
async function requireHost(slug: string): Promise<Host> {
  const host = await getHost(slug)
  if (!host) throw new Error(`Unknown host "${slug}". Register it first or check the slug.`)
  return host
}

/** Open an authenticated connection with trust-on-first-use host-key verification. */
async function connect(host: Host): Promise<ssh2.Client> {
  const privateKey = await getAgentPrivateKey()
  if (!privateKey) throw new Error('No SSH identity configured — generate one in Settings → SSH Identity.')

  const endpoint = `${host.hostname}:${host.port}`
  const conn = new Client()
  let mismatch = false
  let freshKey: string | undefined

  await new Promise<void>((resolve, reject) => {
    conn.on('ready', resolve)
    conn.on('error', (err) => {
      reject(
        mismatch
          ? new Error(
              `Host key verification failed for ${endpoint} — refusing to connect (possible MITM). ` +
                `If you intentionally rebuilt this host, clear its pinned key and reconnect.`,
            )
          : err,
      )
    })
    conn.connect({
      host: host.hostname,
      port: host.port,
      username: host.username,
      privateKey,
      readyTimeout: CONNECT_TIMEOUT_MS,
      hostVerifier: (key: Buffer): boolean => {
        const presented = fingerprint(key)
        const verdict = classifyHostKey(host.hostKey ?? undefined, presented)
        if (verdict === 'mismatch') {
          mismatch = true
          return false
        }
        if (verdict === 'new') freshKey = presented
        return true
      },
    })
  })

  if (freshKey) await setHostKey(host.slug, freshKey) // pin on first connect
  return conn
}

async function withConnection<T>(slug: string, fn: (conn: ssh2.Client) => Promise<T>): Promise<T> {
  const host = await requireHost(slug)
  const conn = await connect(host)
  try {
    return await fn(conn)
  } finally {
    conn.end()
  }
}

function execOnce(conn: ssh2.Client, command: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err)
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        stream.close()
        reject(new Error(`Command timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      stream
        .on('close', (code: number | null) => {
          clearTimeout(timer)
          resolve({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: code ?? 0 })
        })
        .on('data', (d: Buffer) => {
          stdout += d.toString('utf8')
        })
        .stderr.on('data', (d: Buffer) => {
          stderr += d.toString('utf8')
        })
    })
  })
}

function sftpReadFile(conn: ssh2.Client, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.readFile(path, (readErr, buf) => (readErr ? reject(readErr) : resolve(buf.toString('utf8'))))
    })
  })
}

/** Atomic write: stage to a temp file then rename over the target. */
function sftpWriteFile(conn: ssh2.Client, path: string, content: string): Promise<number> {
  const tmp = path + TMP_SUFFIX
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      const data = Buffer.from(content, 'utf8')
      sftp.writeFile(tmp, data, (writeErr) => {
        if (writeErr) return reject(writeErr)
        sftp.rename(tmp, path, (renameErr) => (renameErr ? reject(renameErr) : resolve(data.length)))
      })
    })
  })
}

// ---- Tool primitives -------------------------------------------------------

export async function remoteBash(
  slug: string,
  command: string,
  timeoutMs = DEFAULT_EXEC_TIMEOUT_MS,
): Promise<ExecResult> {
  return withConnection(slug, (conn) => execOnce(conn, command, timeoutMs))
}

export async function remoteRead(slug: string, path: string, offset?: number, limit?: number): Promise<string> {
  return withConnection(slug, async (conn) => {
    const content = await sftpReadFile(conn, path)
    return truncate(formatNumberedLines(content, offset, limit))
  })
}

export async function remoteWrite(slug: string, path: string, content: string): Promise<{ bytes: number }> {
  return withConnection(slug, async (conn) => ({ bytes: await sftpWriteFile(conn, path, content) }))
}

export async function remoteEdit(
  slug: string,
  path: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<{ replacements: number }> {
  return withConnection(slug, async (conn) => {
    const content = await sftpReadFile(conn, path)
    const { result, replacements } = applyEdit(content, oldString, newString, replaceAll)
    await sftpWriteFile(conn, path, result)
    return { replacements }
  })
}

export async function remoteGlob(slug: string, pattern: string, path?: string): Promise<string> {
  const { stdout } = await remoteBash(slug, buildFindCommand(pattern, path), 30_000)
  return stdout.trim()
}

export async function remoteGrep(
  slug: string,
  pattern: string,
  opts: { path?: string; glob?: string; ignoreCase?: boolean } = {},
): Promise<string> {
  const { stdout } = await remoteBash(slug, buildGrepCommand(pattern, opts), 30_000)
  return stdout.trim()
}

/** Test reachability + auth for a host (used by the UI). Pins the host key on first success. */
export async function testHostConnection(slug: string): Promise<{ ok: boolean; user?: string; error?: string }> {
  try {
    const { stdout } = await remoteBash(slug, 'whoami', 10_000)
    return { ok: true, user: stdout.trim() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
