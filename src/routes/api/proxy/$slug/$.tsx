import { createFileRoute } from '@tanstack/react-router'
import { readConfig } from '../../../../lib/config'
import { findSource, proxyRequest } from '../../../../lib/proxy'

export const Route = createFileRoute('/api/proxy/$slug/$')({
  server: {
    handlers: {
      ANY: async ({ request, params }) => {
        const config = await readConfig()
        const source = findSource(config, params.slug)
        if (!source) {
          return Response.json({ error: `Unknown source: ${params.slug}` }, { status: 404 })
        }
        const path = '/' + (params._splat ?? '')
        return proxyRequest(source, path, request)
      },
    },
  },
})
