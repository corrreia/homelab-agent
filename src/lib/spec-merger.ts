import type { Source } from './config'
import { fetchOpenApiSpec } from './source-spec'

export interface MergeResult {
  spec: Record<string, unknown>
  errors: Array<{ slug: string; error: string }>
}

export async function mergeSpecs(sources: Source[], proxyBaseUrl: string): Promise<MergeResult> {
  const errors: MergeResult['errors'] = []
  const mergedPaths: Record<string, unknown> = {}
  const mergedComponents: Record<string, Record<string, unknown>> = {
    schemas: {},
  }

  for (const source of sources) {
    let spec: Record<string, unknown> | undefined
    let lastError: unknown

    try {
      spec = await fetchOpenApiSpec(source)
    } catch (err) {
      lastError = err
    }

    if (!spec) {
      errors.push({
        slug: source.slug,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      })
      continue
    }

    const paths = (spec.paths ?? {}) as Record<string, unknown>
    for (const [path, methods] of Object.entries(paths)) {
      mergedPaths[`/${source.slug}${path}`] = methods
    }

    const components = (spec.components ?? {}) as Record<string, Record<string, unknown>>
    if (components.schemas) {
      for (const [name, schema] of Object.entries(components.schemas)) {
        mergedComponents.schemas[`${source.slug}_${name}`] = schema
      }
    }
  }

  const combinedSpec: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: 'Homelab Agent Combined API',
      version: '1.0.0',
    },
    servers: [{ url: `${proxyBaseUrl}/api/proxy` }],
    paths: mergedPaths,
    components: mergedComponents,
  }

  return { spec: combinedSpec, errors }
}
