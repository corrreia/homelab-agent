import type { AuthConfig, Source } from './config'
import { loadBundledSpec } from './bundled-specs'
import { loggedFetch } from './fetch'
import { getTemplate, resolveBundledSpec as resolveTemplateBundledSpec } from './templates'

function bundledSpecForSource(source: Pick<Source, 'kind' | 'specVersion'>): string | undefined {
  const template = getTemplate(source.kind)
  if (!template) return undefined
  return resolveTemplateBundledSpec(template, source.specVersion)
}

function buildAuthHeaders(auth: AuthConfig): Record<string, string> {
  if (auth.type === 'bearer' && auth.token) {
    return { Authorization: `Bearer ${auth.token}` }
  }

  if (auth.type === 'header' && auth.name && auth.value) {
    return { [auth.name]: auth.value }
  }

  return {}
}

function shouldSendAuth(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

export async function fetchOpenApiSpec(
  source: Pick<
    Source,
    'slug' | 'kind' | 'specUrl' | 'fallbackSpecUrl' | 'specVersion' | 'baseUrl' | 'auth' | 'allowInvalidTls'
  >,
): Promise<Record<string, unknown>> {
  const bundled = bundledSpecForSource(source)
  if (bundled) {
    return loadBundledSpec(bundled)
  }

  const specUrls = [source.specUrl, source.fallbackSpecUrl].filter(Boolean) as string[]
  let lastError: unknown

  for (const specUrl of specUrls) {
    try {
      const headers = shouldSendAuth(specUrl, source.baseUrl) ? buildAuthHeaders(source.auth) : undefined
      const res = await loggedFetch(specUrl, { headers }, 'spec-fetch')
      if (!res.ok) {
        throw new Error(`Failed to fetch spec from ${specUrl}: ${res.status} ${res.statusText}`)
      }

      const text = await res.text()
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        const { load } = await import('js-yaml')
        return load(text) as Record<string, unknown>
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function substituteServerVariables(url: string, variables: unknown): string {
  if (!variables || typeof variables !== 'object') return url
  return url.replace(/\{([^}]+)\}/g, (match, name) => {
    const v = (variables as Record<string, unknown>)[name]
    if (v && typeof v === 'object' && 'default' in v && typeof (v as { default: unknown }).default === 'string') {
      return (v as { default: string }).default
    }
    return match
  })
}

function inferApiBasePath(spec: Record<string, unknown>): string | undefined {
  const servers = Array.isArray(spec.servers) ? spec.servers : []
  const firstServer = servers[0]
  if (!firstServer || typeof firstServer !== 'object' || firstServer === null) {
    return undefined
  }

  const serverUrl = 'url' in firstServer ? firstServer.url : undefined
  if (typeof serverUrl !== 'string' || serverUrl.length === 0) {
    return undefined
  }

  const variables = 'variables' in firstServer ? (firstServer as { variables: unknown }).variables : undefined
  const resolvedUrl = substituteServerVariables(serverUrl, variables)

  try {
    const parsed = new URL(resolvedUrl, 'http://localhost')
    const basePath = parsed.pathname.replace(/\/+$/, '')
    return basePath === '/' ? undefined : basePath
  } catch {
    return undefined
  }
}

export async function withInferredApiBasePath(source: Source): Promise<Source> {
  try {
    const spec = await fetchOpenApiSpec(source)
    const apiBasePath = inferApiBasePath(spec)
    return {
      ...source,
      apiBasePath,
    }
  } catch {
    return source
  }
}
