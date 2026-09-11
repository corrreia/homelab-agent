import type { AuthConfig } from './config'
import { loggedFetch } from './fetch'
import { buildAuthHeaders } from './source-auth'
import { templateAuth, type ServiceTemplate, type TemplateCredentials } from './templates'

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
  allowInvalidTls?: boolean
}

export async function testServiceConnection(req: TestRequest): Promise<TestResult> {
  const url = `${req.baseUrl.replace(/\/+$/, '')}${req.prefix ?? ''}${req.testPath}`

  const headers = buildAuthHeaders(req.auth)

  try {
    const res = await loggedFetch(
      url,
      {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      },
      'test-connection',
      { allowInvalidTls: req.allowInvalidTls },
    )

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
export function templateTestRequest(
  template: ServiceTemplate,
  baseUrl: string,
  creds: TemplateCredentials,
  allowInvalidTls?: boolean,
): TestRequest {
  return {
    baseUrl,
    testPath: template.testEndpoint,
    auth: templateAuth(template, creds),
    prefix: template.publicPathPrefix ?? '',
    allowInvalidTls,
  }
}
