import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth, mcp } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db'

const OIDC_ISSUER = process.env.OIDC_ISSUER
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET

if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
  throw new Error('Missing OIDC env vars: OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  baseURL: process.env.AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.ENCRYPTION_KEY,
  emailAndPassword: { enabled: false },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'oidc',
          discoveryUrl: `${OIDC_ISSUER.replace(/\/+$/, '')}/.well-known/openid-configuration`,
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
          scopes: ['openid', 'profile', 'email'],
          pkce: true,
        },
      ],
    }),
    mcp({
      loginPage: '/login',
    }),
    tanstackStartCookies(),
  ],
})
