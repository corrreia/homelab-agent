import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { type Source } from '../../lib/config'
import { getSource as repoGetSource, updateSource as repoUpdateSource } from '../../lib/sources-repo'
import { templateTestRequest, testServiceConnection, type TestResult } from '../../lib/test-connection'
import { templates, type ServiceTemplate } from '../../lib/templates'
import { colors, fonts } from '../../styles'

const getSource = createServerFn({ method: 'GET' }).handler(async ({ data }: { data: { slug: string } }) => {
  return repoGetSource(data.slug)
})

const updateSource = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { slug: string; source: Source } }) => {
    return repoUpdateSource(data.slug, data.source)
  },
)

const testTemplateConnection = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { templateId: string; baseUrl: string; token: string } }) => {
    const template = templates.find((t) => t.id === data.templateId)
    if (!template) throw new Error('Unknown template')
    return testServiceConnection(templateTestRequest(template, data.baseUrl, data.token))
  },
)

export const Route = createFileRoute('/sources/$slug')({
  loader: ({ params }) => getSource({ data: { slug: params.slug } }),
  component: EditSourcePage,
})

function EditSourcePage() {
  const source = Route.useLoaderData()
  const navigate = useNavigate()
  const { slug } = Route.useParams()

  if (!source) {
    return <p style={{ color: colors.textMuted }}>Source "{slug}" not found.</p>
  }

  const onSaved = () => navigate({ to: '/' })

  if (source.kind === 'custom') {
    return <EditCustomSource source={source} onSaved={onSaved} />
  }

  const template = templates.find((t) => t.id === source.kind)
  if (!template) {
    return (
      <p style={{ color: colors.error }}>
        Source "{slug}" references unknown template "{source.kind}". Edit the database directly.
      </p>
    )
  }

  return <EditTemplateSource source={source} template={template} onSaved={onSaved} />
}

function EditTemplateSource({
  source,
  template,
  onSaved,
}: {
  source: Source
  template: ServiceTemplate
  onSaved: () => void
}) {
  const initialToken = source.auth.token ?? source.auth.value ?? ''
  // For paperless-style "Authorization: Token xxx" we strip the prefix back out for the input.
  const displayToken =
    template.authHeaderName === 'Authorization' && initialToken.startsWith('Token ')
      ? initialToken.slice('Token '.length)
      : initialToken

  const [slug, setSlug] = useState(source.slug)
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [token, setToken] = useState(displayToken)
  const [selectedVersion, setSelectedVersion] = useState(source.specVersion ?? template.specVersions?.[0]?.value ?? '')
  const [allowInvalidTls, setAllowInvalidTls] = useState(source.allowInvalidTls ?? false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const handleTest = async () => {
    if (!baseUrl) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testTemplateConnection({
        data: { templateId: template.id, baseUrl: baseUrl.replace(/\/+$/, ''), token },
      })
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, message: 'Test failed unexpectedly' })
    }
    setTesting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const cleanBase = baseUrl.replace(/\/+$/, '')
    const updated: Source = {
      slug,
      kind: source.kind,
      baseUrl: cleanBase,
      specVersion: template.specVersions ? selectedVersion : undefined,
      allowInvalidTls,
      auth:
        template.authType === 'bearer'
          ? { type: 'bearer', token }
          : template.authType === 'header'
            ? {
                type: 'header',
                name: template.authHeaderName!,
                value: template.authHeaderName === 'Authorization' ? `Token ${token}` : token,
              }
            : { type: 'none' },
    }
    try {
      await updateSource({ data: { slug: source.slug, source: updated } })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        padding: '1.5rem',
        maxWidth: '460px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <img src={template.logo} alt="" style={{ width: 36, height: 36, borderRadius: '8px' }} />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Edit {template.name}</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textDim }}>{template.description}</p>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: colors.error,
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: `${colors.error}11`,
            borderRadius: '6px',
            border: `1px solid ${colors.error}33`,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <FormField label="URL" required>
          <input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              setTestResult(null)
            }}
            placeholder={template.urlPlaceholder}
            style={inputStyle}
          />
        </FormField>

        {template.authType !== 'none' && (
          <FormField label={template.tokenLabel} required>
            <input
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setTestResult(null)
              }}
              type="password"
              style={inputStyle}
            />
          </FormField>
        )}

        {template.specVersions && template.specVersions.length > 0 && (
          <FormField label="API Version" required>
            <select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)} style={inputStyle}>
              {template.specVersions.map((version) => (
                <option key={version.value} value={version.value}>
                  {version.value}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowInvalidTls}
              onChange={(e) => setAllowInvalidTls(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              Allow invalid TLS certs
              <span style={{ display: 'block', color: colors.error, marginTop: '0.2rem' }}>
                Temporary workaround for self-signed or mismatched certificates.
              </span>
            </span>
          </label>
        </div>

        <FormField label="Slug" required>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            style={{ ...inputStyle, width: '200px' }}
          />
        </FormField>

        <div style={{ marginBottom: '1rem' }}>
          <button type="button" onClick={handleTest} disabled={testing || !baseUrl} style={btnSecondaryStyle}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testResult && (
            <span
              style={{
                marginLeft: '0.75rem',
                fontSize: '0.8rem',
                color: testResult.ok ? colors.success : colors.error,
              }}
            >
              {testResult.ok ? '\u2713' : '\u2717'} {testResult.message}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="submit" style={{ ...btnPrimaryStyle, background: template.color }}>
            Save
          </button>
          <button type="button" onClick={onSaved} style={btnSecondaryStyle}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function EditCustomSource({ source, onSaved }: { source: Source; onSaved: () => void }) {
  const [slug, setSlug] = useState(source.slug)
  const [specUrl, setSpecUrl] = useState(source.specUrl ?? '')
  const [fallbackSpecUrl, setFallbackSpecUrl] = useState(source.fallbackSpecUrl ?? '')
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [allowInvalidTls, setAllowInvalidTls] = useState(source.allowInvalidTls ?? false)
  const [authType, setAuthType] = useState(source.auth.type)
  const [token, setToken] = useState(source.auth.token ?? source.auth.value ?? '')
  const [headerName, setHeaderName] = useState(source.auth.name ?? '')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const updated: Source = {
      slug,
      kind: 'custom',
      specUrl,
      fallbackSpecUrl: fallbackSpecUrl || undefined,
      baseUrl,
      allowInvalidTls,
      auth:
        authType === 'bearer'
          ? { type: 'bearer', token }
          : authType === 'header'
            ? { type: 'header', name: headerName, value: token }
            : { type: 'none' },
    }
    try {
      await updateSource({ data: { slug: source.slug, source: updated } })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        padding: '1.5rem',
        maxWidth: '460px',
      }}
    >
      <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 600 }}>Edit {source.slug}</h2>

      {error && (
        <div
          style={{
            color: colors.error,
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: `${colors.error}11`,
            borderRadius: '6px',
            border: `1px solid ${colors.error}33`,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <FormField label="Slug" required>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required style={inputStyle} />
        </FormField>
        <FormField label="OpenAPI Spec URL" required>
          <input value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} required style={inputStyle} />
        </FormField>
        <FormField label="Fallback Spec URL">
          <input value={fallbackSpecUrl} onChange={(e) => setFallbackSpecUrl(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="Base URL" required>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required style={inputStyle} />
        </FormField>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowInvalidTls}
              onChange={(e) => setAllowInvalidTls(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
              Allow invalid TLS certs
              <span style={{ display: 'block', color: colors.error, marginTop: '0.2rem' }}>
                Temporary workaround for self-signed or mismatched certificates.
              </span>
            </span>
          </label>
        </div>
        <FormField label="Auth Type">
          <select value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)} style={inputStyle}>
            <option value="none">None</option>
            <option value="bearer">Bearer Token</option>
            <option value="header">Custom Header</option>
          </select>
        </FormField>
        {authType === 'bearer' && (
          <FormField label="Token">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              required
              style={inputStyle}
            />
          </FormField>
        )}
        {authType === 'header' && (
          <>
            <FormField label="Header Name">
              <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} required style={inputStyle} />
            </FormField>
            <FormField label="Header Value">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                required
                style={inputStyle}
              />
            </FormField>
          </>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="submit" style={btnPrimaryStyle}>
            Save
          </button>
          <button type="button" onClick={onSaved} style={btnSecondaryStyle}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.8rem',
          fontWeight: 500,
          color: colors.textMuted,
          marginBottom: '0.3rem',
        }}
      >
        {label}
        {required && <span style={{ color: colors.textDim }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  background: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  color: colors.text,
  fontFamily: fonts.mono,
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
}

const btnPrimaryStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: colors.accent,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontFamily: fonts.body,
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
}

const btnSecondaryStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'none',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  fontFamily: fonts.body,
  fontSize: '0.85rem',
  cursor: 'pointer',
}
