import { createFileRoute } from '@tanstack/react-router'
import { getCombinedSpec } from '../../lib/mcp-server'

export const Route = createFileRoute('/api/spec')({
  server: {
    handlers: {
      GET: async () => {
        const spec = getCombinedSpec()
        if (!spec) {
          return Response.json({ error: 'MCP server not initialized yet' }, { status: 503 })
        }
        return Response.json(spec)
      },
    },
  },
})
