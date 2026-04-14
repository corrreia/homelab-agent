export interface AuthConfig {
  type: 'bearer' | 'header' | 'none'
  token?: string
  name?: string
  value?: string
}

export interface Source {
  slug: string
  /** Only set for custom (non-template) sources */
  specUrl?: string
  /** Only set for custom (non-template) sources */
  fallbackSpecUrl?: string
  /** Selected version for templates with multiple API versions (e.g. UniFi) */
  specVersion?: string
  baseUrl: string
  apiBasePath?: string
  allowInvalidTls?: boolean
  auth: AuthConfig
}
