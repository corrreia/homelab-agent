import { createFileRoute } from '@tanstack/react-router'
import { proxyRequest } from '../../../../lib/proxy'
import { requireApiSession } from '../../../../lib/require-auth'
import { getSource } from '../../../../lib/sources-repo'

export const Route = createFileRoute('/api/proxy/$slug/$')({
  server: {
    handlers: {
      ANY: async ({ request, params }) => {
        await requireApiSession(request)
        const source = await getSource(params.slug)
        if (!source) {
          return Response.json({ error: `Unknown source: ${params.slug}` }, { status: 404 })
        }
        const path = '/' + (params._splat ?? '')
        return proxyRequest(source, path, request)
      },
    },
  },
})
