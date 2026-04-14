import type { ServiceTemplate } from './templates'

export interface TestResult {
  ok: boolean
  status?: number
  message: string
}

export async function testServiceConnection(
  template: ServiceTemplate,
  baseUrl: string,
  token: string,
  _allowInvalidTls = false,
): Promise<TestResult> {
  const prefix = template.publicPathPrefix ?? template.apiBasePath ?? (template.id === 'seerr' ? '/api/v1' : '')
  const url = `${baseUrl.replace(/\/+$/, '')}${prefix}${template.testEndpoint}`

  const headers: Record<string, string> = {}
  if (template.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${token}`
  } else if (template.authType === 'header' && template.authHeaderName) {
    // Paperless uses "Authorization: Token xxx" — token already has the right value
    if (template.authHeaderName === 'Authorization') {
      headers['Authorization'] = `Token ${token}`
    } else {
      headers[template.authHeaderName] = token
    }
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      return { ok: true, status: res.status, message: 'Connected successfully' }
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: 'Authentication failed — check your API key' }
    }

    return { ok: false, status: res.status, message: `Server returned ${res.status} ${res.statusText}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { ok: false, message: 'Connection timed out — check the URL' }
    }
    if (msg.includes('ERR_TLS_CERT_ALTNAME_INVALID') || msg.includes('certificate') || msg.includes('self-signed')) {
      return { ok: false, message: 'TLS certificate does not match this hostname' }
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { ok: false, message: 'Connection refused — is the service running?' }
    }
    return { ok: false, message: `Connection error: ${msg}` }
  }
}
