import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth'
import { isAllowedMcpRedirectUri, validateMcpCodeChallenge } from '../../../lib/mcp-oauth-guard'

async function guardMcpOAuthRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname
  const authPath = path.replace(/^\/api\/auth/, '')

  if (authPath === '/mcp/register' && request.method === 'POST') {
    return Response.json({ error: 'MCP dynamic client registration is disabled' }, { status: 403 })
  }

  if (authPath === '/mcp/authorize' && request.method === 'GET') {
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirect_uri')
    if (!redirectUri || !isAllowedMcpRedirectUri(redirectUri)) {
      return Response.json({ error: 'MCP redirect URI is not allowed' }, { status: 400 })
    }
    const challengeError = validateMcpCodeChallenge(url.searchParams.get('code_challenge_method'))
    if (challengeError) return Response.json({ error: challengeError }, { status: 400 })
  }

  if (authPath === '/mcp/token' && request.method === 'POST') {
    let body: unknown
    try {
      body = await request.clone().json()
    } catch {
      const formData = await request.clone().formData()
      body = Object.fromEntries(formData.entries())
    }
    if ((body as { grant_type?: unknown }).grant_type === 'refresh_token') {
      return null
    }
    const redirectUri = (body as { redirect_uri?: unknown }).redirect_uri
    if (typeof redirectUri !== 'string' || !isAllowedMcpRedirectUri(redirectUri)) {
      return Response.json({ error: 'MCP redirect URI is not allowed' }, { status: 400 })
    }
  }

  return null
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => (await guardMcpOAuthRequest(request)) ?? auth.handler(request),
      POST: async ({ request }) => (await guardMcpOAuthRequest(request)) ?? auth.handler(request),
    },
  },
})
