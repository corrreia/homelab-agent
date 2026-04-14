import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
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

async function handleMcpRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id') ?? undefined

  // Existing session
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!
    return transport.handleRequest(request)
  }

  // New session — create transport and connect to MCP server
  const server = await buildMcpServer()
  const transport = createTransport()
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: async ({ request }) => handleMcpRequest(request),
      POST: async ({ request }) => handleMcpRequest(request),
      DELETE: async ({ request }) => handleMcpRequest(request),
    },
  },
})
