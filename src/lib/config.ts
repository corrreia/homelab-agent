export interface AuthConfig {
  type: 'bearer' | 'header' | 'basic' | 'none'
  token?: string
  name?: string
  value?: string
  /** `basic` only: sent as `Authorization: Basic base64(username:password)`. */
  username?: string
  password?: string
}

export interface Source {
  slug: string
  /** Either a known template id (e.g. 'jellyfin') or 'custom' */
  kind: string
  /** Only set when kind === 'custom' */
  specUrl?: string
  /** Only set when kind === 'custom' */
  fallbackSpecUrl?: string
  /** Selected version for templates with multiple API versions (e.g. UniFi) */
  specVersion?: string
  baseUrl: string
  apiBasePath?: string
  allowInvalidTls?: boolean
  /** Whether the agent may use this service (the home-page toggle). The repo sets it on every row it returns. */
  enabled?: boolean
  auth: AuthConfig
}
