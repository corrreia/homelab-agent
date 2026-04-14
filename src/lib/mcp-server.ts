import { openApiMcpServer } from '@cloudflare/codemode/mcp'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestOptions } from '@cloudflare/codemode/mcp'
import { NodeVmExecutor } from './node-vm-executor'
import { mergeSpecs } from './spec-merger'
import { getCachedMergedSpec, setCachedMergedSpec } from './spec-cache'
import { type Source } from './config'
import { getSourceBasePath } from './proxy'
import { getSource, getSources } from './sources-repo'
import { loggedFetch } from './fetch'

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

async function makeRequest(options: RequestOptions): Promise<unknown> {
  // Extract slug from the path (first segment)
  const pathParts = options.path.split('/').filter(Boolean)
  const slug = pathParts[0]
  const restPath = '/' + pathParts.slice(1).join('/')

  const source = await getSource(slug!)
  if (!source) {
    throw new Error(`Unknown source: ${slug}`)
  }

  const baseUrl = source.baseUrl.replace(/\/+$/, '')
  const url = new URL(`${baseUrl}${getSourceBasePath(source)}${restPath}`)
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = {
    ...getAuthHeaders(source),
  }
  if (options.body) {
    headers['Content-Type'] = options.contentType ?? 'application/json'
  }

  const res = await loggedFetch(
    url.toString(),
    {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    `mcp[${source.slug}]`,
  )

  if (options.rawBody) {
    return res.text()
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return res.json()
  }
  return res.text()
}

export async function buildMcpServer(): Promise<McpServer> {
  const executor = new NodeVmExecutor()

  let merged = getCachedMergedSpec()
  if (!merged) {
    const port = Number(process.env.PORT ?? 3000)
    const proxyBaseUrl = `http://localhost:${port}`
    const sources = await getSources()
    merged = await mergeSpecs(sources, proxyBaseUrl)
    setCachedMergedSpec(merged)
  }

  const server = openApiMcpServer({
    spec: merged.spec,
    executor,
    request: makeRequest,
    name: 'homelab-agent',
    version: '0.1.0',
    description: 'Combined API gateway exposing multiple OpenAPI services',
  })

  return server
}

export function getCombinedSpec(): Record<string, unknown> | null {
  return getCachedMergedSpec()?.spec ?? null
}

export function getErrors(): Array<{ slug: string; error: string }> {
  return getCachedMergedSpec()?.errors ?? []
}
