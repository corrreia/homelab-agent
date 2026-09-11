import { useEffect, useState } from 'react'
import { copyLabel, useCopy } from '../lib/clipboard'
import { colors, fonts } from '../styles'

const MCP_PATH = '/mcp'

/**
 * The header line: what the agent can currently reach, and the endpoint to point it at.
 * The origin is read from the browser rather than config, so the URL shown is the one the
 * viewer actually reached this page on (LAN IP, tailscale name, reverse-proxy domain, …).
 */
export function McpBar({
  sourceCount,
  pathCount,
  hostCount,
  errors,
}: {
  sourceCount: number
  pathCount: number
  hostCount: number
  errors: Array<{ slug: string; error: string }>
}) {
  const [origin, setOrigin] = useState('')
  const { copy, state } = useCopy()

  useEffect(() => setOrigin(window.location.origin), [])

  const url = `${origin}${MCP_PATH}`

  const prompt =
    `Install the MCP server at ${url} as "homelab-agent" (streamable HTTP transport), ` +
    `then list its tools so I can confirm it connected.`

  const failed = (key: string) => state?.key === key && !state.ok

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem 1rem',
        padding: '0.7rem 0.85rem',
        marginBottom: '1.5rem',
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        fontSize: '0.8rem',
      }}
    >
      <Count value={sourceCount} singular="source" plural="sources" />
      <Count value={pathCount} singular="endpoint" plural="endpoints" />
      <Count value={hostCount} singular="host" plural="hosts" />
      {errors.length > 0 && (
        <span
          title={errors.map((e) => `${e.slug}: ${e.error}`).join('\n')}
          style={{ color: colors.error, cursor: 'help' }}
        >
          {errors.length} {errors.length === 1 ? 'error' : 'errors'}
        </span>
      )}

      <span style={{ flex: 1, minWidth: '1rem' }} />

      <span style={{ color: colors.textDim, fontFamily: fonts.mono, fontSize: '0.75rem' }}>MCP</span>
      <button
        type="button"
        onClick={() => copy('url', url)}
        title="Copy this URL"
        style={{
          fontFamily: fonts.mono,
          fontSize: '0.75rem',
          color: failed('url') ? colors.error : state?.key === 'url' ? colors.success : colors.text,
          background: colors.bgInput,
          padding: '4px 8px',
          borderRadius: '4px',
          border: `1px solid ${colors.border}`,
          cursor: 'pointer',
        }}
      >
        {copyLabel(state, 'url', url || MCP_PATH)}
      </button>
      <button
        type="button"
        onClick={() => copy('prompt', prompt)}
        title="Copy an instruction to paste into your coding agent"
        style={{
          background: failed('prompt') ? colors.error : colors.accent,
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          padding: '0.4rem 0.8rem',
          fontFamily: fonts.body,
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {copyLabel(state, 'prompt', 'Copy prompt')}
      </button>
    </div>
  )
}

function Count({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <span style={{ color: colors.textMuted }}>
      <strong style={{ color: colors.text }}>{value}</strong> {value === 1 ? singular : plural}
    </span>
  )
}
