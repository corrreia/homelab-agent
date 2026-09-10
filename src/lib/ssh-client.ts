// Low-level ssh2 primitives: exec with output caps + kill-on-timeout, and SFTP reads and
// atomic writes. No DB or host lookups here (see ssh.ts for that), so this unit-tests against
// an in-process ssh2 Server.
import { constants as osConstants } from 'node:os'
import { posix } from 'node:path'
import { promisify } from 'node:util'
import ssh2 from 'ssh2'
import type { ClientChannel, SFTPWrapper } from 'ssh2'

export const MAX_OUTPUT_CHARS = 30_000 // ~6k tokens; keeps a runaway `cat` from flooding context.

const TMP_SUFFIX = '.homelab-agent.tmp'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  /** Set when the remote process was terminated by a signal; `exitCode` is then 128 + signal number. */
  signal?: string
}

export function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text

  return text.slice(0, MAX_OUTPUT_CHARS) + `\n… [truncated ${text.length - MAX_OUTPUT_CHARS} more chars]`
}

/** Bounded accumulator: keeps the first MAX_OUTPUT_CHARS and only counts the rest. */
class OutputBuffer {
  private kept = ''
  private dropped = 0

  /** Returns true once the cap is reached. */
  push(chunk: string): boolean {
    const room = MAX_OUTPUT_CHARS - this.kept.length

    if (room > 0) this.kept += chunk.slice(0, room)
    this.dropped += Math.max(0, chunk.length - Math.max(room, 0))

    return this.kept.length >= MAX_OUTPUT_CHARS
  }

  text(): string {
    return this.dropped > 0 ? `${this.kept}\n… [truncated ${this.dropped} more chars]` : this.kept
  }
}

const SIGNAL_NUMBERS: Record<string, number | undefined> = osConstants.signals

function exitCodeOf(code: number | null, signal: string | undefined): number {
  if (code != null) return code

  if (!signal) return -1 // channel closed without an exit status (e.g. we closed it)
  const name = signal.startsWith('SIG') ? signal : `SIG${signal}`

  return 128 + (SIGNAL_NUMBERS[name] ?? 0)
}

/**
 * Run one command on an open connection. Output per stream is capped at MAX_OUTPUT_CHARS;
 * hitting the cap or the timeout sends SIGKILL to the remote process (honoured by OpenSSH ≥ 7.9)
 * and closes the channel, so a runaway command doesn't keep running server-side.
 */
export function execCommand(conn: ssh2.Client, command: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream: ClientChannel) => {
      if (err) return reject(err)
      const stdout = new OutputBuffer()
      const stderr = new OutputBuffer()
      let killed: 'timeout' | 'output' | undefined

      const kill = (reason: 'timeout' | 'output') => {
        if (killed) return
        killed = reason

        try {
          stream.signal('KILL')
        } catch {
          // Server without signal support — closing the channel is the best we can do.
        }

        stream.close()
      }

      const timer = setTimeout(() => {
        kill('timeout')
        reject(new Error(`Command timed out after ${timeoutMs}ms; the remote process was sent SIGKILL`))
      }, timeoutMs)

      // setEncoding runs chunks through a StringDecoder, so multi-byte UTF-8 split across
      // packets is reassembled instead of turning into U+FFFD.
      stream.setEncoding('utf8')
      stream.stderr.setEncoding('utf8')
      stream.on('data', (chunk: string) => {
        if (stdout.push(chunk)) kill('output')
      })
      stream.stderr.on('data', (chunk: string) => {
        stderr.push(chunk)
      })
      stream.on('close', (code: number | null, signal?: string) => {
        clearTimeout(timer)
        const out = stdout.text()

        const result: ExecResult = {
          stdout:
            killed === 'output'
              ? `${out}\n… [output capped at ${MAX_OUTPUT_CHARS} chars; the remote process was sent SIGKILL]`
              : out,
          stderr: stderr.text(),
          exitCode: exitCodeOf(code, signal),
        }

        if (signal) result.signal = signal
        resolve(result)
      })
    })
  })
}

// ---- SFTP -------------------------------------------------------------------

export function openSftp(conn: ssh2.Client): Promise<SFTPWrapper> {
  return promisify(conn.sftp.bind(conn))()
}

export async function sftpReadFile(sftp: SFTPWrapper, path: string): Promise<string> {
  const buf = await promisify<string, Buffer>(sftp.readFile.bind(sftp))(path)

  return buf.toString('utf8')
}

/** SSH_FX_NO_SUCH_FILE (status 2), as surfaced by ssh2's SFTP callbacks. */
interface NoSuchFileError extends Error {
  code?: number
}

function isNoSuchFile(err: unknown): err is NoSuchFileError {
  if (!(err instanceof Error)) return false
  // SAFETY: narrowed to Error above; ssh2 attaches the numeric SFTP status as `code`, absent on others.
  const status = err as NoSuchFileError

  return status.code === 2 || /no such file/i.test(err.message)
}

/**
 * Where a write actually lands, and with which mode. Symlinks are followed so editing a link
 * updates its target (the link survives); an existing file keeps its mode (e.g. 755 scripts).
 */
async function resolveWriteTarget(sftp: SFTPWrapper, path: string): Promise<{ path: string; mode: number }> {
  const realpath = promisify(sftp.realpath.bind(sftp))
  const stat = promisify(sftp.stat.bind(sftp))
  let existing: { path: string; stats: ssh2.Stats } | undefined

  try {
    const resolved = await realpath(path)
    existing = { path: resolved, stats: await stat(resolved) }
  } catch (err) {
    if (!isNoSuchFile(err)) throw err
  }

  if (existing) {
    if (existing.stats.isDirectory()) throw new Error(`${path} is a directory`)

    return { path: existing.path, mode: existing.stats.mode & 0o7777 }
  }

  // New file: resolve the parent so the temp file lands on the same filesystem as the target.
  const parent = await realpath(posix.dirname(path))

  return { path: posix.join(parent, posix.basename(path)), mode: 0o644 }
}

/** Replace `to` with `from`, overwriting. Atomic on OpenSSH (posix-rename); best-effort elsewhere. */
async function renameOver(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  try {
    await promisify(sftp.ext_openssh_rename.bind(sftp))(from, to)

    return
  } catch (err) {
    // ssh2 throws this synchronously when the server advertised no posix-rename extension.
    if (!(err instanceof Error) || !/does not support/i.test(err.message)) throw err
  }

  // Plain SFTP rename refuses to overwrite, so drop the target first. Not atomic — there is a
  // window with no file — but this path only runs on non-OpenSSH servers.
  try {
    await promisify(sftp.unlink.bind(sftp))(to)
  } catch (err) {
    if (!isNoSuchFile(err)) throw err
  }

  await promisify(sftp.rename.bind(sftp))(from, to)
}

/** Atomic write: stage to a temp file beside the target, then rename over it. Returns bytes written. */
export async function sftpWriteFile(sftp: SFTPWrapper, path: string, content: string): Promise<number> {
  const target = await resolveWriteTarget(sftp, path)
  const tmp = `${target.path}.${Math.random().toString(36).slice(2, 10)}${TMP_SUFFIX}`
  const data = Buffer.from(content, 'utf8')

  try {
    await promisify<string, Buffer, ssh2.WriteFileOptions>(sftp.writeFile.bind(sftp))(tmp, data, {
      mode: target.mode,
    })
    await renameOver(sftp, tmp, target.path)
  } catch (err) {
    await promisify(sftp.unlink.bind(sftp))(tmp).catch(() => {}) // never leave the temp file behind
    throw err
  }

  return data.length
}
