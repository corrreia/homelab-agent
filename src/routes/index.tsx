import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { type Source } from '../lib/config'
import {
  addSource as repoAddSource,
  deleteSource as repoDeleteSource,
  getSources as repoGetSources,
  sourceExists,
} from '../lib/sources-repo'
import { templates, type ServiceTemplate } from '../lib/templates'
import { testServiceConnection, type TestResult } from '../lib/test-connection'
import { colors, fonts } from '../styles'

const getSources = createServerFn({ method: 'GET' }).handler(async () => {
  return repoGetSources()
})

const addSource = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: Source }) => {
  if (await sourceExists(data.slug)) {
    throw new Error(`Source "${data.slug}" already exists`)
  }
  await repoAddSource(data)
  return repoGetSources()
})

const deleteSource = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: { slug: string } }) => {
  await repoDeleteSource(data.slug)
  return repoGetSources()
})

const testConnection = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { templateId: string; baseUrl: string; token: string; allowInvalidTls?: boolean } }) => {
    const template = templates.find((t) => t.id === data.templateId)
    if (!template) throw new Error('Unknown template')
    return testServiceConnection(template, data.baseUrl, data.token, data.allowInvalidTls)
  },
)

export const Route = createFileRoute('/')({
  loader: () => getSources(),
  component: HomePage,
})

function HomePage() {
  const sources = Route.useLoaderData()
  const [activeTemplate, setActiveTemplate] = useState<ServiceTemplate | null>(null)
  const [showManual, setShowManual] = useState(false)

  return (
    <div>
      {/* Active sources */}
      {sources.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: colors.textDim,
              marginBottom: '0.75rem',
            }}
          >
            Active Services
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sources.map((source) => {
              const template = templates.find((t) => t.defaultSlug === source.slug || t.id === source.slug)
              return (
                <div
                  key={source.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: colors.bgCard,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                  }}
                >
                  {template && (
                    <img
                      src={template.logo}
                      alt=""
                      style={{ width: 24, height: 24, borderRadius: '4px', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      to="/sources/$slug"
                      params={{ slug: source.slug }}
                      style={{
                        color: colors.text,
                        textDecoration: 'none',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                      }}
                    >
                      {source.slug}
                    </Link>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: colors.textDim,
                        fontFamily: fonts.mono,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.baseUrl}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: fonts.mono,
                      color: colors.textDim,
                      background: colors.bgInput,
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {source.auth.type}
                  </span>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove "${source.slug}"?`)) {
                        await deleteSource({ data: { slug: source.slug } })
                        window.location.reload()
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.textDim,
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Template picker or form */}
      {activeTemplate ? (
        <TemplateForm
          template={activeTemplate}
          existingSlugs={sources.map((s) => s.slug)}
          onCancel={() => setActiveTemplate(null)}
        />
      ) : showManual ? (
        <ManualForm existingSlugs={sources.map((s) => s.slug)} onCancel={() => setShowManual(false)} />
      ) : (
        <section>
          <h2
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: colors.textDim,
              marginBottom: '0.75rem',
            }}
          >
            Add Service
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            {templates.map((t) => {
              const alreadyAdded = sources.some((s) => s.slug === t.defaultSlug)
              return (
                <button
                  key={t.id}
                  onClick={() => !alreadyAdded && setActiveTemplate(t)}
                  disabled={alreadyAdded}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: alreadyAdded ? colors.bgInput : colors.bgCard,
                    border: `1px solid ${alreadyAdded ? colors.border : colors.border}`,
                    borderRadius: '8px',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    opacity: alreadyAdded ? 0.4 : 1,
                    textAlign: 'left',
                    color: colors.text,
                    fontFamily: fonts.body,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!alreadyAdded) {
                      e.currentTarget.style.borderColor = t.color
                      e.currentTarget.style.background = colors.bgHover
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.border
                    e.currentTarget.style.background = alreadyAdded ? colors.bgInput : colors.bgCard
                  }}
                >
                  <img
                    src={t.logo}
                    alt=""
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '6px',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: colors.textDim }}>{t.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setShowManual(true)}
            style={{
              background: 'none',
              border: `1px dashed ${colors.border}`,
              color: colors.textDim,
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: fonts.body,
              fontSize: '0.85rem',
            }}
          >
            + Custom OpenAPI source
          </button>
        </section>
      )}
    </div>
  )
}

function TemplateForm({
  template,
  existingSlugs,
  onCancel,
}: {
  template: ServiceTemplate
  existingSlugs: string[]
  onCancel: () => void
}) {
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [slug, setSlug] = useState(template.defaultSlug)
  const [selectedVersion, setSelectedVersion] = useState(template.specVersions?.[0]?.value ?? '')
  const [allowInvalidTls, setAllowInvalidTls] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    if (!baseUrl) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection({
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

    if (existingSlugs.includes(slug)) {
      setError(`Slug "${slug}" already in use`)
      return
    }

    const cleanBase = baseUrl.replace(/\/+$/, '')

    const source: Source = {
      slug,
      specVersion: template.specVersions ? selectedVersion : undefined,
      baseUrl: cleanBase,
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
      await addSource({ data: source })
      window.location.reload()
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
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Add {template.name}</h2>
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

        {/* Test connection */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !baseUrl}
            style={{
              ...btnSecondaryStyle,
              opacity: testing || !baseUrl ? 0.5 : 1,
            }}
          >
            {testing ? 'Testing...' : 'Test Connection'}
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

        <FormField label="Slug">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            style={{ ...inputStyle, width: '160px' }}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="submit" style={{ ...btnPrimaryStyle, background: template.color }}>
            Add {template.name}
          </button>
          <button type="button" onClick={onCancel} style={btnSecondaryStyle}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function ManualForm({ existingSlugs, onCancel }: { existingSlugs: string[]; onCancel: () => void }) {
  const [slug, setSlug] = useState('')
  const [specUrl, setSpecUrl] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [allowInvalidTls, setAllowInvalidTls] = useState(false)
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'header'>('none')
  const [token, setToken] = useState('')
  const [headerName, setHeaderName] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (existingSlugs.includes(slug)) {
      setError(`Slug "${slug}" already in use`)
      return
    }

    const source: Source = {
      slug,
      specUrl,
      baseUrl,
      allowInvalidTls,
      auth:
        authType === 'bearer'
          ? { type: 'bearer', token }
          : authType === 'header'
            ? { type: 'header', name: headerName, value: headerValue }
            : { type: 'none' },
    }

    try {
      await addSource({ data: source })
      window.location.reload()
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
      <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 600 }}>Custom Source</h2>

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
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-service" style={inputStyle} />
        </FormField>
        <FormField label="OpenAPI Spec URL" required>
          <input
            value={specUrl}
            onChange={(e) => setSpecUrl(e.target.value)}
            placeholder="https://api.example.com/openapi.json"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Base URL" required>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            style={inputStyle}
          />
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
          <FormField label="Token" required>
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" style={inputStyle} />
          </FormField>
        )}
        {authType === 'header' && (
          <>
            <FormField label="Header Name" required>
              <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Header Value" required>
              <input
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
                type="password"
                style={inputStyle}
              />
            </FormField>
          </>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="submit" style={btnPrimaryStyle}>
            Add Source
          </button>
          <button type="button" onClick={onCancel} style={btnSecondaryStyle}>
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
