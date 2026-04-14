import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCombinedSpec, getErrors, buildMcpServer } from '../lib/mcp-server'
import { getSources } from '../lib/sources-repo'
import { colors, fonts } from '../styles'

let initialized = false

const getStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const sources = await getSources()
  const spec = getCombinedSpec()
  const errors = getErrors()
  const pathCount = spec ? Object.keys((spec.paths as Record<string, unknown>) ?? {}).length : 0

  return {
    initialized,
    sourceCount: sources.length,
    pathCount,
    errors,
    mcpPath: '/api/mcp',
    port: Number(process.env.PORT ?? 3000),
  }
})

const rebuildServer = createServerFn({ method: 'POST' }).handler(async () => {
  await buildMcpServer()
  initialized = true
  return { ok: true }
})

export const Route = createFileRoute('/status')({
  loader: () => getStatus(),
  component: StatusPage,
})

function StatusPage() {
  const status = Route.useLoaderData()

  return (
    <div>
      <h2
        style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.textDim,
          marginBottom: '1rem',
        }}
      >
        MCP Server
      </h2>

      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: '10px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Stat
            label="Status"
            value={status.initialized ? 'Running' : 'Not initialized'}
            color={status.initialized ? colors.success : colors.warning}
          />
          <Stat label="Sources" value={String(status.sourceCount)} />
          <Stat label="Endpoints" value={String(status.pathCount)} />
          <Stat label="MCP URL" value={`http://localhost:${status.port}${status.mcpPath}`} mono />
        </div>

        <button
          onClick={async () => {
            await rebuildServer()
            window.location.reload()
          }}
          style={{
            marginTop: '1.25rem',
            padding: '0.5rem 1rem',
            background: colors.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontFamily: fonts.body,
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {status.initialized ? 'Rebuild Server' : 'Initialize Server'}
        </button>
      </div>

      {status.errors.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: colors.error,
              marginBottom: '0.75rem',
            }}
          >
            Errors
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {status.errors.map((err) => (
              <div
                key={err.slug}
                style={{
                  padding: '0.75rem 1rem',
                  background: `${colors.error}11`,
                  border: `1px solid ${colors.error}33`,
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                }}
              >
                <strong>{err.slug}</strong>
                <span style={{ color: colors.textDim }}> — </span>
                {err.error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: colors.textDim,
          marginBottom: '0.2rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? '0.8rem' : '0.95rem',
          fontWeight: mono ? 400 : 600,
          fontFamily: mono ? fonts.mono : fonts.body,
          color: color ?? colors.text,
        }}
      >
        {value}
      </div>
    </div>
  )
}
