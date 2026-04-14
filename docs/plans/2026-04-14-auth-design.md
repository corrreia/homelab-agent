# OAuth + Drizzle + SQLite — Design

**Date:** 2026-04-14
**Status:** Approved, ready for implementation

## Problem

The web UI and `/api/mcp` are wide open. Anyone reaching the host can manage
sources or invoke any wrapped homelab API.

The `data/config.json` blob is also growing awkward: nested arrays, manual
parse/write, no transactions, no schema, no audit trail.

## Goal

- Gate the web UI and MCP server behind OAuth, with Pocket ID as the upstream
  identity provider.
- Move sources from `config.json` to SQLite via Drizzle in the same pass.
- Keep the homelab UX simple: one IdP, one DB file, single Docker mount.

## Out of scope

- Per-user sources / RBAC — sources stay shared.
- Replacing the global `NODE_TLS_REJECT_UNAUTHORIZED=0` hack (separate work).
- Migrating existing `config.json` data — fresh start, re-add 4 sources via UI.

## Architecture

```
Claude Code ──OAuth (PKCE)──► Our app (Better Auth)
                                     │
                                     ├─ user not logged in?
                                     │      │
                                     │      └──OIDC──► Pocket ID
                                     │                     │
                                     │                     ▼ passkey
                                     │              callback to us
                                     │
                                     ├─ consent screen
                                     │
                                     └─ issue bearer token to client
                                              │
                                              ▼
                                       Claude Code uses token
                                              ▼
                                          /api/mcp
```

Better Auth is the OAuth provider for MCP clients. It federates the actual
user login to Pocket ID via OIDC. MCP clients only need to know our URL.

## Stack

**Runtime deps:**

- `better-auth` — sessions, OAuth provider for MCP, OIDC client for Pocket ID
- `drizzle-orm` — type-safe SQL builder
- `better-sqlite3` — sync SQLite driver

**Dev deps:**

- `drizzle-kit` — migrations CLI

**Better Auth plugins:**

- `mcp()` — `/.well-known/oauth-protected-resource`, `/api/auth/oauth/*`,
  token issuance + validation for MCP clients
- `genericOAuth({ providerId: 'pocket-id', ... })` — federate login to Pocket ID
- `tanstackStartCookies()` — cookie wiring for TanStack Start

**Removed:**

- `js-yaml` — only the live-fetch path used it (custom sources stay JSON-only)
- `readConfig` / `writeConfig` from `src/lib/config.ts`

**Storage:** `data/app.db` — single SQLite file, sits next to where
`config.json` lived. No new Docker mount needed.

**Env vars** (replacing `config.json` server fields and Pocket ID config):

```
BETTER_AUTH_SECRET=<random 32+ bytes>
BETTER_AUTH_URL=http://localhost:3000
POCKET_ID_ISSUER=https://pocket-id.example
POCKET_ID_CLIENT_ID=<from Pocket ID admin>
POCKET_ID_CLIENT_SECRET=<from Pocket ID admin>
```

## Database schema

Drizzle schema in `src/db/schema.ts`. SQLite tables.

**Better Auth-managed (created via Drizzle adapter):**

- `user` — id, email, name, emailVerified, image, timestamps
- `session` — id, userId, expiresAt, token, ipAddress, userAgent
- `account` — links a user to a Pocket ID identity (providerId='pocket-id',
  accountId=Pocket ID `sub`, accessToken, refreshToken, idToken, etc.)
- `verification` — short-lived verification codes

**MCP plugin tables:**

- `oauthApplication` — registered MCP clients (clientId, clientSecret,
  redirectURIs, name)
- `oauthAccessToken` — issued bearer tokens (token, userId, clientId,
  expiresAt, scopes)
- `oauthConsent` — user-approved client consents

**Our `sources` table** — direct port of current `Source` shape, no new fields:

```ts
export const sources = sqliteTable('sources', {
  slug: text('slug').primaryKey(),
  baseUrl: text('base_url').notNull(),
  apiBasePath: text('api_base_path'),         // auto-derived from spec
  specVersion: text('spec_version'),          // UniFi-style versioned templates
  specUrl: text('spec_url'),                  // custom sources only
  fallbackSpecUrl: text('fallback_spec_url'), // custom sources only
  allowInvalidTls: integer('allow_invalid_tls', { mode: 'boolean' })
    .notNull()
    .default(false),
  authType: text('auth_type', { enum: ['bearer', 'header', 'none'] }).notNull(),
  authToken: text('auth_token'),              // bearer only
  authHeaderName: text('auth_header_name'),   // header only
  authHeaderValue: text('auth_header_value'), // header only
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})
```

Sources stay global, not user-scoped. Anyone authenticated can manage them.

**Migrations:** `drizzle-kit generate` produces SQL files in
`data/migrations/`. App applies them on startup via
`migrate(db, { migrationsFolder })` — idempotent, tracked in
`__drizzle_migrations`.

## Auth flows

### Web UI login

1. Hit `/` → server-side guard checks Better Auth session cookie → no session
   → redirect to `/login`
2. `/login` page has one button: "Sign in with Pocket ID"
3. Click → Better Auth's OIDC client kicks off Authorization Code + PKCE to
   Pocket ID
4. Pocket ID prompts for passkey → callback to `/api/auth/callback/pocket-id`
5. Better Auth creates `user` + `account` rows (or matches existing), sets
   session cookie
6. Redirect back to `/`
7. All UI routes + `/api/sources/*` gated via Better Auth middleware

### MCP client flow

1. Client hits `/api/mcp` → no/invalid bearer → 401 +
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`
2. Client fetches `/.well-known/oauth-protected-resource` → gets authorization
   server URL (our app, not Pocket ID)
3. Client fetches `/.well-known/oauth-authorization-server` → gets
   `/authorize`, `/token`, `/register` endpoints
4. Client does dynamic registration via RFC 7591 → gets `client_id` (no secret
   for public clients with PKCE)
5. Client opens browser to `/authorize` with PKCE
6. **User** sees Better Auth's consent screen — "Claude Code wants to access
   homelab-agent" → Approve
7. If no session yet, Better Auth bounces user through Pocket ID login first
8. Approve → callback to client with auth code → client exchanges for token at
   `/token`
9. Client retries `/api/mcp` with `Authorization: Bearer <token>`
10. Better Auth validates the token (looks up `oauthAccessToken`) → injects
    user into request → MCP server runs

### Token validation on `/api/mcp`

Wrap existing handler with Better Auth's `withMcpAuth()` helper. Returns 401
if missing/invalid, otherwise hands the session to the handler.

### Logout

`/api/auth/sign-out` → clears cookie. MCP tokens stay valid until expiry.
Revoke via UI page that lists active `oauthAccessToken` rows.

## Code organization

**New files:**

```
src/
  db/
    index.ts              # Drizzle client + migration runner
    schema.ts             # All table definitions
  lib/
    auth.ts               # Better Auth instance + plugin config
    auth-client.ts        # Browser-side Better Auth client (for React)
    sources-repo.ts       # Replaces config.json reads/writes
  routes/
    api/
      auth/
        $.tsx             # Catch-all → Better Auth handler
    login.tsx             # Single sign-in page
data/
  migrations/             # drizzle-kit output, gitignored
  app.db                  # SQLite file, gitignored
.env                      # gitignored, has POCKET_ID_* + BETTER_AUTH_SECRET
.env.example              # committed, placeholder values
drizzle.config.ts         # drizzle-kit config
```

**Files that change:**

- `src/lib/config.ts` — gutted. `Source` and `AuthConfig` types stay (used
  everywhere). Read/write functions removed. Server config moves to env vars.
- `src/lib/mcp-server.ts` — `readConfig()` → `getSources()`. `proxyBaseUrl`
  from env not config.
- `src/lib/spec-cache.ts` — `invalidateMergedSpecCache()` called from
  `sources-repo.ts` mutations instead of `writeConfig`.
- `src/lib/proxy.ts`, `src/lib/spec-merger.ts`, `src/lib/source-spec.ts` —
  accept `Source[]` from repo unchanged.
- `src/routes/api/sources/*.tsx` + `src/routes/sources/$slug.tsx` +
  `src/routes/index.tsx` — call `sources-repo` functions; gated via auth
  middleware.
- `src/routes/api/mcp.tsx` — wrap handler in `withMcpAuth()`.
- `src/routes/__root.tsx` — `beforeLoad` guard redirecting to `/login` if no
  session.
- `package.json` — add `db:generate`, `db:migrate` scripts.
- `server.entry.js` — apply migrations on startup before serving.

## Implementation order

Sequence designed so each step boots, runs, and can be tested before moving on.

### Step 1 — Drizzle + SQLite skeleton (no auth yet)

- Install `drizzle-orm`, `better-sqlite3`, `drizzle-kit`
- Create `src/db/{index.ts,schema.ts}` with just the `sources` table
- Create `drizzle.config.ts`, run `pnpm db:generate` → first migration
- Wire migration runner into `server.entry.js`
- **Verify:** `pnpm dev` boots, `data/app.db` appears,
  `sqlite3 data/app.db ".schema"` shows `sources`

### Step 2 — Sources repo

- Create `src/lib/sources-repo.ts` mirroring current usage: `getSources()`,
  `getSource(slug)`, `addSource()`, `updateSource()`, `deleteSource()`
- Each mutation calls `invalidateMergedSpecCache()`
- Switch all 4 route handlers + `mcp-server.ts` to use the repo
- Delete `readConfig` / `writeConfig` from `config.ts`; keep types
- **Verify:** re-add a source via UI, MCP query works end-to-end

### Step 3 — Better Auth + Pocket ID OIDC

- Install `better-auth`
- Create `src/lib/auth.ts` with
  `genericOAuth({ providerId: 'pocket-id', ... })` + `tanstackStartCookies()`
- Create catch-all route `src/routes/api/auth/$.tsx`
- Create `/login` page with sign-in button
- Add `beforeLoad` guard in `__root.tsx`
- **Verify:** open browser → redirect to `/login` → click → Pocket ID passkey
  → land back at `/`, session cookie set

### Step 4 — MCP plugin

- Add `mcp()` plugin to Better Auth config
- Generate + run new migration (adds `oauthApplication`, `oauthAccessToken`,
  `oauthConsent`)
- Wrap `/api/mcp` handler in `withMcpAuth()`
- **Verify:** Claude Code tries to connect → 401 → opens browser → consent
  screen → approve → tools work

### Step 5 — Cleanup

- Remove `data/config.json` reading code entirely
- Update `.env.example`, README/docs
- One commit per step.

## Verification

- After Step 2: `pnpm build` green, source CRUD works via UI, MCP tool calls
  succeed.
- After Step 3: visiting `/` while logged out always redirects to `/login`;
  after Pocket ID passkey, session persists across reloads.
- After Step 4: `curl /api/mcp` without auth returns 401; Claude Code prompts
  for browser auth on first connect; after approval, MCP tools work.
- Final: no references to `readConfig`/`writeConfig` anywhere; `config.json`
  removed from working tree (already gitignored).
