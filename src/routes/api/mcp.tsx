import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { withMcpAuth } from 'better-auth/plugins'
import { auth } from '../../lib/auth'
import { buildMcpServer } from '../../lib/mcp-server'

const transports = new Map<string, WebStandardStreamableHTTPServerTransport>()

function createTransport(): WebStandardStreamableHTTPServerTransport {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sid) => {
      transports.set(sid, transport)
    },
  })
  // eslint-disable-next-line unicorn/prefer-add-event-listener -- MCP SDK exposes onclose as a property setter
  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId)
    }
  }
  return transport
}

const handleMcpRequest = withMcpAuth(auth, async (request) => {
  const sessionId = request.headers.get('mcp-session-id') ?? undefined

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!
    return transport.handleRequest(request)
  }

  const server = await buildMcpServer()
  const transport = createTransport()
  await server.connect(transport)
  return transport.handleRequest(request)
})

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleMcpRequest(request),
      POST: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
