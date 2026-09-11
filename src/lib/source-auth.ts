import type { AuthConfig } from './config'

/**
 * The request headers a source's credentials produce. One implementation for all three callers —
 * the proxy, the spec fetcher and the connection test — so a new auth type can't be handled in one
 * place and silently dropped in another.
 */
export function buildAuthHeaders(auth: AuthConfig): Record<string, string> {
  switch (auth.type) {
    case 'bearer':
      return auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
    case 'header':
      return auth.name && auth.value ? { [auth.name]: auth.value } : {}
    case 'basic':
      return auth.username ? { Authorization: `Basic ${encodeBasic(auth.username, auth.password ?? '')}` } : {}
    case 'none':
    default:
      return {}
  }
}

/** RFC 7617 credentials: base64 of `username:password`. */
export function encodeBasic(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
}
