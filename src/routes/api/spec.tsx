import { createFileRoute } from '@tanstack/react-router'
import { getCombinedSpec } from '../../lib/mcp-server'
import { requireApiSession } from '../../lib/require-auth'

export const Route = createFileRoute('/api/spec')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireApiSession(request)
        const spec = getCombinedSpec()
        if (!spec) {
          return Response.json({ error: 'MCP server not initialized yet' }, { status: 503 })
        }
        return Response.json(spec)
      },
    },
  },
})
