import type { ReactNode } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../lib/auth'
import { colors, fonts } from '../styles'

const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = new Headers(getRequestHeaders())
  const session = await auth.api.getSession({ headers })
  return session
})

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (
      location.pathname === '/login' ||
      location.pathname === '/mcp' ||
      location.pathname.startsWith('/api/') ||
      location.pathname.startsWith('/.well-known/')
    ) {
      return { session: null }
    }
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }
    return { session }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Homelab Agent' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <p style={{ color: colors.textMuted, padding: '2rem' }}>Not found</p>,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        style={{
          fontFamily: fonts.body,
          margin: 0,
          padding: 0,
          background: colors.bg,
          color: colors.text,
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            borderBottom: `1px solid ${colors.border}`,
            padding: '0 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '56px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '-0.02em' }}>homelab-agent</span>
            <span
              style={{
                fontSize: '0.65rem',
                fontFamily: fonts.mono,
                color: colors.textDim,
                background: colors.bgCard,
                padding: '2px 6px',
                borderRadius: '4px',
                border: `1px solid ${colors.border}`,
              }}
            >
              MCP
            </span>
          </div>
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
            {[
              { to: '/' as const, label: 'Services' },
              { to: '/status' as const, label: 'Status' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                style={{
                  color: colors.textMuted,
                  textDecoration: 'none',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  transition: 'color 0.15s, background 0.15s',
                }}
                activeProps={{
                  style: {
                    color: colors.text,
                    background: colors.bgCard,
                  },
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>{children}</main>
        <Scripts />
      </body>
    </html>
  )
}
