import http from 'node:http'
import https from 'node:https'

function toNodeHeaders(headers: Headers): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const [name, value] of headers.entries()) {
    const existing = result[name]
    if (existing === undefined) {
      result[name] = value
      continue
    }
    result[name] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }
  return result
}

function toResponseHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item)
      continue
    }
    result.set(name, value)
  }
  return result
}

async function toRequestBody(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
  if (body == null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  return Buffer.from(await new Response(body).arrayBuffer())
}

async function fetchWithOptionalInvalidTls(
  url: string,
  init: RequestInit,
  allowInvalidTls: boolean,
): Promise<Response> {
  const target = new URL(url)
  if (!allowInvalidTls || target.protocol !== 'https:') {
    return fetch(url, init)
  }

  const headers = new Headers(init.headers)
  const body = await toRequestBody(init.body)

  return new Promise((resolve, reject) => {
    const req = https.request(
      target,
      {
        method: init.method,
        headers: toNodeHeaders(headers),
        agent: new https.Agent({ rejectUnauthorized: false }),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          const status = res.statusCode ?? 500
          const nullBody = status === 204 || status === 205 || status === 304
          resolve(
            new Response(nullBody ? null : Buffer.concat(chunks), {
              status,
              statusText: res.statusMessage ?? '',
              headers: toResponseHeaders(res.headers),
            }),
          )
        })
      },
    )

    req.on('error', reject)

    if (init.signal) {
      const abort = () =>
        req.destroy(init.signal?.reason instanceof Error ? init.signal.reason : new Error('Request aborted'))
      if (init.signal.aborted) {
        abort()
        return
      }
      init.signal.addEventListener('abort', abort, { once: true })
      req.on('close', () => init.signal?.removeEventListener('abort', abort))
    }

    if (body) req.write(body)
    req.end()
  })
}

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

export async function loggedFetch(
  url: string,
  init: RequestInit,
  context: string,
  options?: { allowInvalidTls?: boolean },
): Promise<Response> {
  try {
    const res = await fetchWithOptionalInvalidTls(url, init, options?.allowInvalidTls ?? false)
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
