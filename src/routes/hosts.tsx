import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { requireCurrentSession } from '../lib/require-auth'
import {
  createHost as repoCreateHost,
  deleteHost as repoDeleteHost,
  endpointOf,
  ensureAgentIdentity,
  forgetHostKey as repoForgetHostKey,
  getHost,
  listHosts,
  regenerateAgentIdentity,
  type Host,
  type HostInput,
} from '../lib/hosts-repo'
import { testHostConnection } from '../lib/ssh'
import { colors, fonts } from '../styles'

const getHostsData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireCurrentSession()
  const { publicKey } = await ensureAgentIdentity() // generate on first visit

  return { hosts: await listHosts(), publicKey }
})

const addHost = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: HostInput }) => {
  await requireCurrentSession()
  await repoCreateHost(data)

  return listHosts()
})

const removeHost = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: { slug: string } }) => {
  await requireCurrentSession()
  await repoDeleteHost(data.slug)

  return listHosts()
})

const forgetKey = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: { slug: string } }) => {
  await requireCurrentSession()
  const host = await getHost(data.slug)

  if (host) await repoForgetHostKey(endpointOf(host))

  return listHosts()
})

// Also returns the host list: a successful first test pins the server key.
const testHost = createServerFn({ method: 'POST' }).handler(async ({ data }: { data: { slug: string } }) => {
  await requireCurrentSession()
  const result = await testHostConnection(data.slug)

  return { result, hosts: await listHosts() }
})

const rotateIdentity = createServerFn({ method: 'POST' }).handler(async () => {
  await requireCurrentSession()

  return regenerateAgentIdentity()
})

export const Route = createFileRoute('/hosts')({
  loader: () => getHostsData(),
  component: HostsPage,
})

const label = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: colors.textDim,
  marginBottom: '0.75rem',
} as const

const inputStyle = {
  background: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  color: colors.text,
  padding: '0.5rem 0.6rem',
  fontSize: '0.85rem',
  fontFamily: fonts.body,
} as const

const buttonStyle = {
  background: colors.accent,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.5rem 0.9rem',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
} as const

function HostsPage() {
  const data = Route.useLoaderData()
  const [hosts, setHosts] = useState<Host[]>(data.hosts)
  const [publicKey, setPublicKey] = useState(data.publicKey)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ slug: '', label: '', hostname: '', port: '22', username: 'root' })
  const [error, setError] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, { ok: boolean; user?: string; error?: string } | 'pending'>>({})

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      const next = await addHost({
        data: {
          slug: form.slug.trim(),
          label: form.label.trim() || undefined,
          hostname: form.hostname.trim(),
          port: Number(form.port) || 22,
          username: form.username.trim(),
        },
      })

      setHosts(next)
      setForm({ slug: '', label: '', hostname: '', port: '22', username: 'root' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDelete(slug: string) {
    if (!window.confirm(`Remove host "${slug}"?`)) return
    setHosts(await removeHost({ data: { slug } }))
  }

  async function onTest(slug: string) {
    setTests((t) => ({ ...t, [slug]: 'pending' }))
    const { result, hosts: next } = await testHost({ data: { slug } })
    setTests((t) => ({ ...t, [slug]: result }))
    setHosts(next)
  }

  async function onForgetKey(slug: string) {
    if (
      !window.confirm(
        `Forget the pinned server key for "${slug}"? Only do this if you rebuilt the host yourself — the next connection will trust whatever key it presents.`,
      )
    )
      return
    setHosts(await forgetKey({ data: { slug } }))
  }

  async function onRegenerate() {
    if (!window.confirm('Generate a new key? You must add the new public key to every host before they work again.'))
      return
    const { publicKey: pk } = await rotateIdentity()
    setPublicKey(pk)
  }

  function copyKey() {
    void navigator.clipboard?.writeText(publicKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      {/* SSH Identity */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={label}>SSH Identity</h2>
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: colors.textMuted }}>
            Add this public key to <code style={{ fontFamily: fonts.mono }}>~/.ssh/authorized_keys</code> on each host.
            The private key stays encrypted on the server.
          </p>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: '0.78rem',
              color: colors.text,
              background: colors.bgInput,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              padding: '0.6rem',
              wordBreak: 'break-all',
            }}
          >
            {publicKey}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button type="button" onClick={copyKey} style={buttonStyle}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: colors.textMuted,
                border: `1px solid ${colors.border}`,
              }}
            >
              Regenerate
            </button>
          </div>
        </div>
      </section>

      {/* Hosts */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={label}>Hosts</h2>
        {hosts.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: colors.textDim }}>No hosts yet. Add one below.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {hosts.map((h) => {
            const t = tests[h.slug]

            return (
              <div
                key={h.slug}
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {h.label}{' '}
                    <span style={{ color: colors.textDim, fontFamily: fonts.mono, fontSize: '0.8rem' }}>
                      ({h.slug})
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: colors.textDim, fontFamily: fonts.mono }}>
                    {h.username}@{h.hostname}:{h.port}
                    {h.pinned ? '  · key pinned' : '  · key not yet pinned'}
                  </div>
                </div>
                {h.pinned && (
                  <button
                    type="button"
                    onClick={() => onForgetKey(h.slug)}
                    title="Clear the pinned server key (only after you rebuilt the host)"
                    style={{
                      ...buttonStyle,
                      background: 'transparent',
                      color: colors.textMuted,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    Forget key
                  </button>
                )}
                {t && t !== 'pending' && (
                  <span
                    style={{ fontSize: '0.78rem', color: t.ok ? colors.success : colors.error, fontFamily: fonts.mono }}
                  >
                    {t.ok ? `ok (${t.user})` : 'failed'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onTest(h.slug)}
                  style={{
                    ...buttonStyle,
                    background: 'transparent',
                    color: colors.textMuted,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  {t === 'pending' ? 'Testing…' : 'Test'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(h.slug)}
                  style={{
                    ...buttonStyle,
                    background: 'transparent',
                    color: colors.error,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Add host */}
      <section>
        <h2 style={label}>Add Host</h2>
        <form onSubmit={onAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <Field
            label="Slug"
            value={form.slug}
            onChange={(v) => setForm({ ...form, slug: v })}
            placeholder="nas"
            required
          />
          <Field label="Label" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="NAS" />
          <Field
            label="Hostname / IP"
            value={form.hostname}
            onChange={(v) => setForm({ ...form, hostname: v })}
            placeholder="192.168.1.10"
            required
          />
          <Field
            label="Port"
            value={form.port}
            onChange={(v) => setForm({ ...form, port: v })}
            placeholder="22"
            width={70}
          />
          <Field
            label="User"
            value={form.username}
            onChange={(v) => setForm({ ...form, username: v })}
            placeholder="root"
            required
          />
          <button type="submit" style={buttonStyle}>
            Add
          </button>
        </form>
        {error && <p style={{ color: colors.error, fontSize: '0.82rem', marginTop: '0.6rem' }}>{error}</p>}
      </section>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  width?: number
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.7rem', color: colors.textDim }}>{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        style={{ ...inputStyle, width: props.width ?? 150 }}
      />
    </label>
  )
}
