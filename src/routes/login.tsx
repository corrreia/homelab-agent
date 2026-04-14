import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client'
import { colors, fonts } from '../styles'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setError(null)
    setLoading(true)
    const { error: err } = await authClient.signIn.oauth2({
      providerId: 'oidc',
      callbackURL: '/',
    })
    if (err) {
      setError(err.message ?? 'Sign-in failed')
      setLoading(false)
    } else {
      navigate({ to: '/' })
    }
  }

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: '10px',
          padding: '2rem',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, fontFamily: fonts.body }}>Sign in</h1>
        <p style={{ margin: '0.5rem 0 1.5rem', color: colors.textMuted, fontSize: '0.9rem' }}>
          Sign in with your OIDC provider to access the homelab agent.
        </p>
        {error && (
          <div
            style={{
              color: colors.error,
              background: `${colors.error}11`,
              border: `1px solid ${colors.error}33`,
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.65rem 1rem',
            background: colors.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontFamily: fonts.body,
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Redirecting…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}
