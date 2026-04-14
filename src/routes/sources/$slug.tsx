import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { type Source } from '../../lib/config'
import { getSource as repoGetSource, updateSource as repoUpdateSource } from '../../lib/sources-repo'
import { templates } from '../../lib/templates'
import { colors, fonts } from '../../styles'

const getSource = createServerFn({ method: 'GET' }).handler(async ({ data }: { data: { slug: string } }) => {
  return repoGetSource(data.slug)
})

const updateSource = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: { slug: string; source: Source } }) => {
    return repoUpdateSource(data.slug, data.source)
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
  const template = templates.find((t) => t.defaultSlug === slug || t.id === slug)

  if (!source) {
    return <p style={{ color: colors.textMuted }}>Source "{slug}" not found.</p>
  }

  return <EditForm source={source} template={template} onSaved={() => navigate({ to: '/' })} />
}

function EditForm({
  source,
  template,
  onSaved,
}: {
  source: Source
  template?: (typeof templates)[number]
  onSaved: () => void
}) {
  const [specUrl, setSpecUrl] = useState(source.specUrl ?? '')
  const [fallbackSpecUrl, setFallbackSpecUrl] = useState(source.fallbackSpecUrl ?? '')
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [allowInvalidTls, setAllowInvalidTls] = useState(source.allowInvalidTls ?? false)
  const [authType, setAuthType] = useState(source.auth.type)
  const [token, setToken] = useState(source.auth.token ?? source.auth.value ?? '')
  const [headerName, setHeaderName] = useState(source.auth.name ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const updated: Source = {
      slug: source.slug,
      specUrl: template ? undefined : specUrl || undefined,
      fallbackSpecUrl: template ? undefined : fallbackSpecUrl || undefined,
      specVersion: source.specVersion,
      baseUrl,
      allowInvalidTls,
      auth:
        authType === 'bearer'
          ? { type: 'bearer', token }
          : authType === 'header'
            ? { type: 'header', name: headerName, value: token }
            : { type: 'none' },
    }
    await updateSource({ data: { slug: source.slug, source: updated } })
    onSaved()
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
        {template && <img src={template.logo} alt="" style={{ width: 32, height: 32, borderRadius: '6px' }} />}
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Edit {source.slug}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {!template && (
          <>
            <FormField label="Spec URL">
              <input value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} required style={inputStyle} />
            </FormField>
            <FormField label="Fallback Spec URL">
              <input value={fallbackSpecUrl} onChange={(e) => setFallbackSpecUrl(e.target.value)} style={inputStyle} />
            </FormField>
          </>
        )}
        <FormField label="Base URL">
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
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
