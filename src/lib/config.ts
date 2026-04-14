export interface AuthConfig {
  type: 'bearer' | 'header' | 'none'
  token?: string
  name?: string
  value?: string
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
  auth: AuthConfig
}
