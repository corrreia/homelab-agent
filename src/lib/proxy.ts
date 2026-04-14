import type { Config, Source } from './config'
import { loggedFetch } from './fetch'

export function findSource(config: Config, slug: string): Source | undefined {
  return config.sources.find((s) => s.slug === slug)
}

export function getSourceBasePath(source: Source): string {
  if (source.apiBasePath) return source.apiBasePath
  if (source.slug === 'seerr') return '/api/v1'
  if (source.slug === 'bazarr') return '/api'
  return ''
}

function getAuthHeaders(source: Source): Record<string, string> {
  switch (source.auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${source.auth.token}` }
    case 'header':
      if (source.auth.name && source.auth.value) {
        return { [source.auth.name]: source.auth.value }
      }
      return {}
    case 'none':
    default:
      return {}
  }
}

export async function proxyRequest(source: Source, path: string, request: Request): Promise<Response> {
  const url = new URL(`${source.baseUrl.replace(/\/+$/, '')}${getSourceBasePath(source)}${path}`)

  // Forward query params from the original request
  const originalUrl = new URL(request.url)
  originalUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const authHeaders = getAuthHeaders(source)

  // Forward relevant headers, add auth
  const headers = new Headers()
  const forwardHeaders = ['content-type', 'accept', 'user-agent']
  for (const name of forwardHeaders) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  for (const [name, value] of Object.entries(authHeaders)) {
    headers.set(name, value)
  }

  const res = await loggedFetch(
    url.toString(),
    {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      // @ts-expect-error - duplex is needed for streaming body
      duplex: 'half',
    },
    `proxy[${source.slug}]`,
  )

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  })
}
