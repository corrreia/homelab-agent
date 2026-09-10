import { createHash } from 'node:crypto'
import ssh2 from 'ssh2'
import type { Host } from './hosts-repo'
import { endpointOf, getAgentPrivateKey, getHost, getPinnedHostKey, pinHostKey } from './hosts-repo'
import { execCommand, openSftp, sftpReadFile, sftpWriteFile, truncate, type ExecResult } from './ssh-client'
import {
  applyEdit,
  buildFindCommand,
  buildGrepCommand,
  classifyHostKey,
  classifySearchExit,
  formatNumberedLines,
} from './ssh-helpers'

export type { ExecResult } from './ssh-client'

const { Client } = ssh2

const CONNECT_TIMEOUT_MS = 15_000

export const DEFAULT_EXEC_TIMEOUT_MS = 120_000

function fingerprint(hostKey: Buffer): string {
  return createHash('sha256').update(hostKey).digest('base64')
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

  if (!privateKey) throw new Error('No SSH identity configured — open the Hosts page (/hosts) to generate one.')

  const endpoint = endpointOf(host)
  const pinned = await getPinnedHostKey(endpoint)
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
                `If you intentionally rebuilt this host, a human must forget its pinned key on the Hosts page (/hosts) and reconnect.`,
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
        const verdict = classifyHostKey(pinned ?? undefined, presented)

        if (verdict === 'mismatch') {
          mismatch = true

          return false
        }

        if (verdict === 'new') freshKey = presented

        return true
      },
    })
  })

  if (freshKey) await pinHostKey(endpoint, freshKey) // pin on first connect

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

// ---- Tool primitives -------------------------------------------------------

export async function remoteBash(
  slug: string,
  command: string,
  timeoutMs = DEFAULT_EXEC_TIMEOUT_MS,
): Promise<ExecResult> {
  return withConnection(slug, (conn) => execCommand(conn, command, timeoutMs))
}

export async function remoteRead(slug: string, path: string, offset?: number, limit?: number): Promise<string> {
  return withConnection(slug, async (conn) => {
    const content = await sftpReadFile(await openSftp(conn), path)

    return truncate(formatNumberedLines(content, offset, limit))
  })
}

export async function remoteWrite(slug: string, path: string, content: string): Promise<{ bytes: number }> {
  return withConnection(slug, async (conn) => ({ bytes: await sftpWriteFile(await openSftp(conn), path, content) }))
}

export async function remoteEdit(
  slug: string,
  path: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<{ replacements: number }> {
  return withConnection(slug, async (conn) => {
    const sftp = await openSftp(conn)
    const content = await sftpReadFile(sftp, path)
    const { result, replacements } = applyEdit(content, oldString, newString, replaceAll)
    await sftpWriteFile(sftp, path, result)

    return { replacements }
  })
}

/** Surface a search tool's own error (missing path, bad pattern, …) instead of "no matches". */
function searchOutput(result: ExecResult, tool: string): string {
  if (classifySearchExit(result.exitCode) === 'error') {
    throw new Error(result.stderr.trim().split('\n')[0] || `${tool} failed with exit code ${result.exitCode}`)
  }

  return result.stdout.trim()
}

export async function remoteGlob(slug: string, pattern: string, path?: string): Promise<string> {
  const result = await remoteBash(slug, buildFindCommand(pattern, path), 30_000)

  // find exits 1 on any unreadable directory, which is routine noise unless nothing was found.
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    throw new Error(result.stderr.trim().split('\n')[0] || `find failed with exit code ${result.exitCode}`)
  }

  return result.stdout.trim()
}

export async function remoteGrep(
  slug: string,
  pattern: string,
  opts: { path?: string; glob?: string; ignoreCase?: boolean } = {},
): Promise<string> {
  return searchOutput(await remoteBash(slug, buildGrepCommand(pattern, opts), 30_000), 'grep')
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
