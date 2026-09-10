import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth, mcp } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db'

const OIDC_ISSUER = process.env.OIDC_ISSUER

const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID

const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET

/** Prototyping escape hatch: skips every session check (web UI, /api/*, /mcp). */
export const authDisabled = process.env.DANGEROUSLY_DISABLE_AUTH === 'true'

if (authDisabled) {
  console.warn(
    '\n[auth] ⚠️  WARNING: DANGEROUSLY_DISABLE_AUTH=true — AUTHENTICATION IS OFF. THIS IS HIGHLY NOT ADVISED.\n' +
      '[auth] Anyone who can reach this server can use every source and run commands on every SSH host.\n' +
      '[auth] Use it only for local prototyping and never expose this instance to a network.\n',
  )
} else if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
  throw new Error('Missing OIDC env vars: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET')
}

if (!BETTER_AUTH_SECRET) {
  throw new Error('Missing BETTER_AUTH_SECRET env var')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  baseURL: process.env.AUTH_URL ?? 'http://localhost:3000',
  secret: BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: false },
  plugins: [
    genericOAuth({
      // OIDC is optional only when auth is disabled; otherwise the check above guarantees it.
      config:
        OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET
          ? [
              {
                providerId: 'oidc',
                discoveryUrl: `${OIDC_ISSUER.replace(/\/+$/, '')}/.well-known/openid-configuration`,
                clientId: OIDC_CLIENT_ID,
                clientSecret: OIDC_CLIENT_SECRET,
                scopes: ['openid', 'profile', 'email'],
                pkce: true,
              },
            ]
          : [],
    }),
    mcp({
      loginPage: '/login',
      oidcConfig: {
        loginPage: '/login',
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
      },
    }),
    tanstackStartCookies(),
  ],
})
