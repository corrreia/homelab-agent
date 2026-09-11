import { useState } from 'react'
import { copyLabel, useCopy } from '../lib/clipboard'
import type { Host, HostInput } from '../lib/hosts-repo'
import { colors, fonts } from '../styles'
import { ConfirmStrip } from './ConfirmStrip'
import { SectionHeader } from './SectionHeader'

export type HostTest = { ok: boolean; user?: string; error?: string }

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
  fontFamily: fonts.body,
} as const

const quietButton = {
  ...buttonStyle,
  background: 'transparent',
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
} as const

const EMPTY_FORM = { slug: '', label: '', hostname: '', port: '22', username: 'root' }

/** Which destructive action is awaiting a second click, if any. */
type Pending = { kind: 'remove' | 'forget'; slug: string }

/**
 * SSH hosts the agent can reach, plus the public key that has to be installed on each one.
 * Presentational: every mutation is handed up so the page can refresh its loader data.
 */
export function HostsSection({
  hosts,
  publicKey,
  onAdd,
  onRemove,
  onForgetKey,
  onTest,
}: {
  hosts: Host[]
  publicKey: string
  onAdd: (input: HostInput) => Promise<void>
  onRemove: (slug: string) => Promise<void>
  onForgetKey: (slug: string) => Promise<void>
  onTest: (slug: string) => Promise<HostTest>
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [tests, setTests] = useState<Record<string, HostTest | 'pending'>>({})
  const { copy, state: copyState } = useCopy()
  // With no hosts the form is the whole section, so it stays open regardless of the toggle.
  const showForm = adding || hosts.length === 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      await onAdd({
        slug: form.slug.trim(),
        label: form.label.trim() || undefined,
        hostname: form.hostname.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
      })
      setForm(EMPTY_FORM)
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function test(slug: string) {
    setTests((t) => ({ ...t, [slug]: 'pending' }))
    const result = await onTest(slug)

    setTests((t) => ({ ...t, [slug]: result }))
  }

  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <SectionHeader
        title="Hosts"
        count={hosts.length}
        action={
          hosts.length > 0 ? { label: adding ? 'Cancel' : '+ Add host', onClick: () => setAdding(!adding) } : null
        }
      />

      {hosts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {hosts.map((h) => {
            const t = tests[h.slug]
            const awaiting = pending?.slug === h.slug ? pending.kind : null

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
                {awaiting ? (
                  <ConfirmStrip
                    question={
                      awaiting === 'remove'
                        ? `Remove "${h.slug}"?`
                        : 'Forget the pinned key? The next connection trusts whatever key the host presents.'
                    }
                    confirmLabel={awaiting === 'remove' ? 'Remove' : 'Forget key'}
                    onConfirm={async () => {
                      setPending(null)
                      await (awaiting === 'remove' ? onRemove(h.slug) : onForgetKey(h.slug))
                    }}
                    onCancel={() => setPending(null)}
                  />
                ) : (
                  <>
                    {h.pinned && (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'forget', slug: h.slug })}
                        title="Clear the pinned server key (only after you rebuilt the host)"
                        style={quietButton}
                      >
                        Forget key
                      </button>
                    )}
                    {t && t !== 'pending' && (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: t.ok ? colors.success : colors.error,
                          fontFamily: fonts.mono,
                        }}
                        title={t.ok ? undefined : t.error}
                      >
                        {t.ok ? `ok (${t.user})` : 'failed'}
                      </span>
                    )}
                    <button type="button" onClick={() => test(h.slug)} style={quietButton}>
                      {t === 'pending' ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'remove', slug: h.slug })}
                      style={{ ...quietButton, color: colors.error }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'flex-end',
            marginBottom: '0.75rem',
          }}
        >
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
          <Field label="Port" value={form.port} onChange={(v) => setForm({ ...form, port: v })} width={70} />
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
          {hosts.length > 0 && (
            <button type="button" onClick={() => setAdding(false)} style={quietButton}>
              Cancel
            </button>
          )}
        </form>
      )}
      {error && <p style={{ color: colors.error, fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}

      {/* The key every host needs before it can be reached. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          flexWrap: 'wrap',
          padding: '0.6rem 0.85rem',
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: colors.textMuted, whiteSpace: 'nowrap' }}>Agent public key</span>
        <code
          title={publicKey}
          style={{
            flex: 1,
            minWidth: '12rem',
            fontFamily: fonts.mono,
            fontSize: '0.75rem',
            color: colors.textDim,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {publicKey}
        </code>
        <span style={{ fontSize: '0.72rem', color: colors.textDim, whiteSpace: 'nowrap' }}>
          → each host's ~/.ssh/authorized_keys
        </span>
        <button
          type="button"
          onClick={() => copy('key', publicKey)}
          style={copyState?.key === 'key' && !copyState.ok ? { ...quietButton, color: colors.error } : quietButton}
        >
          {copyLabel(copyState, 'key', 'Copy')}
        </button>
      </div>
    </section>
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
