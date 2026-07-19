import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { type Source } from '../../lib/config'
import { listHosts } from '../../lib/hosts-repo'
import { requireCurrentSession } from '../../lib/require-auth'
import {
  getPublicSource as repoGetPublicSource,
  type PublicSource,
  setSourceHost as repoSetSourceHost,
  updateSourcePreservingSecret as repoUpdateSource,
} from '../../lib/sources-repo'
import { templateTestRequest, testServiceConnection, type TestResult } from '../../lib/test-connection'
import { templates, type ServiceTemplate } from '../../lib/templates'
import { colors, fonts } from '../../styles'

const getSource = createServerFn({ method: 'GET' }).handler(async ({ data }: { data: { slug: string } }) => {
  await requireCurrentSession()
  return repoGetPublicSource(data.slug)
})

const updateSource = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { slug: string; source: Source } }) => {
    await requireCurrentSession()
    await repoUpdateSource(data.slug, data.source)
    return { ok: true }
  },
)

const listHostOptions = createServerFn({ method: 'GET' }).handler(async () => {
  await requireCurrentSession()
  return (await listHosts()).map((h) => ({ slug: h.slug, label: h.label }))
})

const linkSourceHost = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { slug: string; hostSlug: string | null } }) => {
    await requireCurrentSession()
    await repoSetSourceHost(data.slug, data.hostSlug)
    return { ok: true }
  },
)

const testTemplateConnection = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { templateId: string; baseUrl: string; token: string; allowInvalidTls?: boolean } }) => {
    await requireCurrentSession()
    const template = templates.find((t) => t.id === data.templateId)
    if (!template) throw new Error('Unknown template')
    return testServiceConnection(templateTestRequest(template, data.baseUrl, data.token, data.allowInvalidTls))
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

  const template = source.kind === 'custom' ? undefined : templates.find((t) => t.id === source.kind)
  if (source.kind !== 'custom' && !template) {
    return (
      <p style={{ color: colors.error }}>
        Source "{slug}" references unknown template "{source.kind}". Edit the database directly.
      </p>
    )
  }

  return (
    <>
      <SourceHostLink slug={source.slug} current={source.hostSlug ?? null} />
      {template ? (
        <EditTemplateSource source={source} template={template} onSaved={onSaved} />
      ) : (
        <EditCustomSource source={source} onSaved={onSaved} />
      )}
    </>
  )
}

/** Small self-contained control: link this source to the SSH host it runs on. */
function SourceHostLink({ slug, current }: { slug: string; current: string | null }) {
  const [hosts, setHosts] = useState<Array<{ slug: string; label: string }>>([])
  const [value, setValue] = useState(current ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void listHostOptions().then(setHosts)
  }, [])

  async function onChange(next: string) {
    setValue(next)
    await linkSourceHost({ data: { slug, hostSlug: next || null } })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <section style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>Runs on host</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: colors.bgInput,
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          color: colors.text,
          padding: '0.4rem 0.5rem',
          fontSize: '0.85rem',
          fontFamily: fonts.body,
        }}
      >
        <option value="">— none —</option>
        {hosts.map((h) => (
          <option key={h.slug} value={h.slug}>
            {h.label} ({h.slug})
          </option>
        ))}
      </select>
      {saved && <span style={{ color: colors.success, fontSize: '0.78rem' }}>saved</span>}
      {hosts.length === 0 && (
        <span style={{ color: colors.textDim, fontSize: '0.78rem' }}>no hosts registered yet</span>
      )}
    </section>
  )
}

function EditTemplateSource({
  source,
  template,
  onSaved,
}: {
  source: PublicSource
  template: ServiceTemplate
  onSaved: () => void
}) {
  const [slug, setSlug] = useState(source.slug)
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [token, setToken] = useState('')
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
        data: { templateId: template.id, baseUrl: baseUrl.replace(/\/+$/, ''), token, allowInvalidTls },
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
          ? { type: 'bearer', token: token || undefined }
          : template.authType === 'header'
            ? {
                type: 'header',
                name: template.authHeaderName!,
                value: token ? (template.authHeaderName === 'Authorization' ? `Token ${token}` : token) : undefined,
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
          <FormField label={template.tokenLabel} required={!source.auth.hasSecret}>
            <input
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setTestResult(null)
              }}
              type="password"
              placeholder={source.auth.hasSecret ? 'Leave blank to keep existing' : ''}
              required={!source.auth.hasSecret}
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
              <span style={{ display: 'block', marginTop: '0.2rem' }}>
                Use this when the service uses a self-signed or private homelab certificate.
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

function EditCustomSource({ source, onSaved }: { source: PublicSource; onSaved: () => void }) {
  const [slug, setSlug] = useState(source.slug)
  const [specUrl, setSpecUrl] = useState(source.specUrl ?? '')
  const [fallbackSpecUrl, setFallbackSpecUrl] = useState(source.fallbackSpecUrl ?? '')
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [allowInvalidTls, setAllowInvalidTls] = useState(source.allowInvalidTls ?? false)
  const [authType, setAuthType] = useState(source.auth.type)
  const [token, setToken] = useState('')
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
          ? { type: 'bearer', token: token || undefined }
          : authType === 'header'
            ? { type: 'header', name: headerName, value: token || undefined }
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
              <span style={{ display: 'block', marginTop: '0.2rem' }}>
                Use this when the service uses a self-signed or private homelab certificate.
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
          <FormField label="Token" required={!source.auth.hasSecret}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder={source.auth.hasSecret ? 'Leave blank to keep existing' : ''}
              required={!source.auth.hasSecret}
              style={inputStyle}
            />
          </FormField>
        )}
        {authType === 'header' && (
          <>
            <FormField label="Header Name">
              <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} required style={inputStyle} />
            </FormField>
            <FormField label="Header Value" required={!source.auth.hasSecret}>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                placeholder={source.auth.hasSecret ? 'Leave blank to keep existing' : ''}
                required={!source.auth.hasSecret}
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
