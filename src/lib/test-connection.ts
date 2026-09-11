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

const TEST_TIMEOUT_MS = 10_000

/** Node's codes for a server certificate the client refused. */
const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

/** The system error code behind a failed request: native fetch puts it on `cause`, node:https on the error. */
function errorCode(err: Error): string {
  const source = err.cause instanceof Error ? err.cause : err

  return 'code' in source ? String(source.code) : ''
}

/**
 * Say what actually went wrong. Native fetch reports every network failure as "fetch failed", so
 * matching on the message alone turned a refused certificate into "Connection refused".
 */
export function describeFailure(err: Error): string {
  const code = errorCode(err)

  if (err.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return `No response within ${TEST_TIMEOUT_MS / 1000}s. Check the URL; if it is right, a firewall is likely dropping traffic from this server to the service.`
  }

  if (TLS_CODES.has(code)) {
    return `TLS certificate not trusted (${code}). If the service uses a self-signed or private certificate, tick "Allow invalid TLS certs".`
  }

  if (code === 'ECONNREFUSED') return 'Connection refused. Nothing is listening at that address and port.'

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'The hostname does not resolve from this server.'

  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'The host is unreachable from this server.'

  const detail = err.cause instanceof Error ? err.cause.message : err.message

  return `Connection error: ${detail}${code ? ` (${code})` : ''}`
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
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
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

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      const target = location ? ` to ${location}` : ''

      return {
        ok: false,
        status: res.status,
        message: `Redirected${target}. The URL probably points at a login page or is missing a path prefix.`,
      }
    }

    return { ok: false, status: res.status, message: `Server returned ${res.status} ${res.statusText}` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? describeFailure(err) : `Connection error: ${String(err)}` }
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
