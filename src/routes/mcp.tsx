import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { withMcpAuth } from 'better-auth/plugins'
import { auth, authDisabled } from '../lib/auth'
import { buildMcpServer } from '../lib/mcp-server'
import { isExpiredMcpAccessToken } from '../lib/mcp-oauth-guard'

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

async function serveMcpRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id') ?? undefined

  if (sessionId) {
    const transport = transports.get(sessionId)

    if (!transport) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null,
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      )
    }

    return transport.handleRequest(request)
  }

  const server = await buildMcpServer()
  const transport = createTransport()
  await server.connect(transport)

  return transport.handleRequest(request)
}

const handleMcpRequest = authDisabled
  ? serveMcpRequest
  : withMcpAuth(auth, async (request, session) => {
      if (isExpiredMcpAccessToken(session.accessTokenExpiresAt)) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Unauthorized: access token expired' },
            id: null,
          }),
          { status: 401, headers: { 'content-type': 'application/json', 'WWW-Authenticate': 'Bearer' } },
        )
      }

      return serveMcpRequest(request)
    })

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleMcpRequest(request),
      POST: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
