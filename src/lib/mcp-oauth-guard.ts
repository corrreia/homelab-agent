const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function configuredRedirectUris(): Set<string> {
  return new Set(
    (process.env.MCP_ALLOWED_REDIRECT_URIS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

export function isAllowedMcpRedirectUri(value: string): boolean {
  if (configuredRedirectUris().has(value)) return true

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== 'http:') return false
  return LOOPBACK_HOSTS.has(url.hostname)
}

export function validateMcpRedirectUris(values: unknown): string | null {
  if (!Array.isArray(values) || values.length === 0) {
    return 'redirect_uris must be a non-empty array'
  }
  for (const value of values) {
    if (typeof value !== 'string' || !isAllowedMcpRedirectUri(value)) {
      return `MCP redirect URI is not allowed: ${String(value)}`
    }
  }
  return null
}

export function validateMcpCodeChallenge(method: unknown): string | null {
  if (typeof method !== 'string') return 'code_challenge_method=S256 is required'
  return method.toLowerCase() === 's256' ? null : 'code_challenge_method=S256 is required'
}

export function isExpiredMcpAccessToken(expiresAt: unknown): boolean {
  if (!expiresAt) return true
  const expires = expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt))
  return Number.isNaN(expires.getTime()) || expires <= new Date()
}
