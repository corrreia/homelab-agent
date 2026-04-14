import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth, mcp } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db'

const POCKET_ID_ISSUER = process.env.POCKET_ID_ISSUER
const POCKET_ID_CLIENT_ID = process.env.POCKET_ID_CLIENT_ID
const POCKET_ID_CLIENT_SECRET = process.env.POCKET_ID_CLIENT_SECRET

if (!POCKET_ID_ISSUER || !POCKET_ID_CLIENT_ID || !POCKET_ID_CLIENT_SECRET) {
  throw new Error('Missing Pocket ID env vars: POCKET_ID_ISSUER, POCKET_ID_CLIENT_ID, POCKET_ID_CLIENT_SECRET')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: false },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'pocket-id',
          discoveryUrl: `${POCKET_ID_ISSUER.replace(/\/+$/, '')}/.well-known/openid-configuration`,
          clientId: POCKET_ID_CLIENT_ID,
          clientSecret: POCKET_ID_CLIENT_SECRET,
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
