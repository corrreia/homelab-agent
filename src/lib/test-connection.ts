import type { AuthConfig } from './config'
import type { ServiceTemplate } from './templates'

export interface TestResult {
  ok: boolean
  status?: number
  message: string
}

export interface TestRequest {
  baseUrl: string
  testPath: string
  auth: AuthConfig
  prefix?: string
}

export async function testServiceConnection(req: TestRequest): Promise<TestResult> {
  const url = `${req.baseUrl.replace(/\/+$/, '')}${req.prefix ?? ''}${req.testPath}`

  const headers: Record<string, string> = {}
  if (req.auth.type === 'bearer' && req.auth.token) {
    headers['Authorization'] = `Bearer ${req.auth.token}`
  } else if (req.auth.type === 'header' && req.auth.name && req.auth.value) {
    headers[req.auth.name] = req.auth.value
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

/** Build a TestRequest from a template and the user's per-instance values. */
export function templateTestRequest(template: ServiceTemplate, baseUrl: string, token: string): TestRequest {
  const prefix = template.publicPathPrefix ?? (template.id === 'seerr' ? '/api/v1' : '')
  const auth: AuthConfig =
    template.authType === 'bearer'
      ? { type: 'bearer', token }
      : template.authType === 'header' && template.authHeaderName
        ? {
            type: 'header',
            name: template.authHeaderName,
            value: template.authHeaderName === 'Authorization' ? `Token ${token}` : token,
          }
        : { type: 'none' }
  return { baseUrl, testPath: template.testEndpoint, auth, prefix }
}
