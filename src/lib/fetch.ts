// TODO: TLS verification is globally disabled in early development via the
// `NODE_TLS_REJECT_UNAUTHORIZED=0` env var (set in docker-compose.yml and
// server.entry.js). Before any non-dev use, remove that env var, restore the
// per-source `allowInvalidTls` flag, and have an undici Agent applied only to
// sources that opt in. Note: undici@8 Agents cannot be passed as `dispatcher`
// to Node 22's built-in `fetch` (UND_ERR_INVALID_ARG); pin undici to a
// version matching Node's bundled one, or use undici's own `fetch` export.

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as { cause?: unknown }).cause
  const causeStr =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}${(cause as { code?: string }).code ? ` (${(cause as { code?: string }).code})` : ''}`
      : cause
        ? String(cause)
        : ''
  return causeStr ? `${err.message} → cause: ${causeStr}` : err.message
}

export async function loggedFetch(url: string, init: RequestInit, context: string): Promise<Response> {
  try {
    const res = await fetch(url, init)
    if (!res.ok) {
      console.warn(`[fetch] ${context} ${init.method ?? 'GET'} ${url} → ${res.status} ${res.statusText}`)
    } else {
      console.log(`[fetch] ${context} ${init.method ?? 'GET'} ${url} → ${res.status}`)
    }
    return res
  } catch (err) {
    console.error(`[fetch] ${context} ${init.method ?? 'GET'} ${url} FAILED: ${describeError(err)}`)
    throw err
  }
}
