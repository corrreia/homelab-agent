# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: homelab-agent

Project-specific context that's easy to get wrong without reading a lot of code.

## Architecture at a glance

- **TanStack Start** (React 19, SSR) — file-based routes in `src/routes/`. `createServerFn` handlers live alongside components; `server` handlers under `src/routes/api/*` are the HTTP API.
- **Auth:** Better Auth + generic OIDC via `genericOAuth` (any standards-compliant issuer — Pocket ID, Authentik, Keycloak, Auth0, …). Config in `src/lib/auth.ts`. `/mcp` is additionally gated by Better Auth's `mcp` plugin.
- **Storage:** Drizzle + `better-sqlite3` at `data/app.db`. Schema in `src/db/schema.ts`, migrations in `migrations/` (generate with `pnpm db:generate`, apply with `pnpm db:migrate`). Migrations live outside `data/` so that mounting `./data` as a Docker volume doesn't clobber them.
- **MCP:** `@cloudflare/codemode` exposes two tools (`search`/`execute`) over a merged OpenAPI spec. Entry point: `src/lib/mcp-server.ts`. Executor is `src/lib/quickjs-executor.ts`.
- **Proxy:** `src/lib/proxy.ts` forwards `/api/proxy/:slug/*` to the upstream, injecting creds from the DB. Request headers are allow-listed; response headers are allow-listed too.
- **Sources:** User-added upstream services. Bundled OpenAPI templates live in `specs/`, wired via `src/lib/templates.ts` + `src/lib/bundled-specs.ts`. Custom sources fetch their spec at runtime (`src/lib/source-spec.ts`).

## Conventions and invariants

- **Every route under `src/routes/api/*` calls `requireApiSession(request)` before doing anything.** If you add a new API route, do the same. `/mcp` uses `withMcpAuth` instead.
- **`src/lib/sources-repo.ts` is the only place that reads or writes source rows.** Encryption/decryption of `authToken` and `authHeaderValue` happens there via `src/lib/encryption.ts` — never touch the raw columns.
- **Credentials are encrypted at rest** with AES‑256‑GCM. The key is HKDF-derived from `ENCRYPTION_KEY`. Never log decrypted values. Never add backwards-compat paths that accept plaintext on read — the DB only ever holds the `v1:` envelope.
- **URLs are scheme-restricted** to `http:`/`https:` at source-creation time (see `validateHttpUrl` in `sources-repo.ts`). Don't bypass.
- **The merged OpenAPI spec is cached** (`src/lib/spec-cache.ts`). Any mutation through `sources-repo` calls `invalidateMergedSpecCache()` — maintain that invariant when adding new write paths.
- **Dev vs prod bootstrap differ.** In prod, `server.entry.js` runs drizzle migrations before loading the built server. In dev, migrations are manual (`pnpm db:migrate`). Don't put migration-dependent side effects at module-load time in `src/db/index.ts`.
- **No RBAC by design.** Any authenticated user is effectively admin. Don't add role checks unless the product changes.
- **Styling:** design tokens live in `src/styles.ts`. No CSS-in-JS library; inline `style={{...}}` is the project's pattern. Match it.

## Common commands

```bash
pnpm dev              # vite dev server
pnpm build            # prod build
pnpm start            # run ./server.entry.js against the built output
pnpm lint             # oxlint
pnpm format           # oxfmt
pnpm db:generate      # new drizzle migration from schema changes
pnpm db:migrate       # apply pending migrations
pnpm db:studio        # drizzle studio
```

Typecheck: `pnpm exec tsc --noEmit`. There are pre-existing TS errors in `src/routes/index.tsx` and `src/routes/sources/$slug.tsx` around TanStack Start server-function typings — ignore those unless your change touches those lines.

## File landmarks

| Path | What lives there |
|---|---|
| `src/routes/__root.tsx` | SSR shell, session gate, top-level nav |
| `src/routes/api/*` | HTTP API handlers (all session-gated) |
| `src/routes/mcp.tsx` | MCP endpoint (Better Auth MCP plugin) |
| `src/lib/auth.ts` | Better Auth + generic OIDC config |
| `src/lib/sources-repo.ts` | Source CRUD, encryption boundary |
| `src/lib/encryption.ts` | AES-GCM helpers + HKDF |
| `src/lib/proxy.ts` | `/api/proxy/:slug/*` forwarding |
| `src/lib/mcp-server.ts` | Code Mode MCP server wiring |
| `src/lib/quickjs-executor.ts` | QuickJS-based Code Mode executor |
| `src/lib/spec-merger.ts` | Combine per-source specs into one |
| `src/lib/templates.ts` | Built-in source templates |
| `specs/` | Bundled OpenAPI JSONs |
| `migrations/` | Drizzle migrations (checked in) |
| `server.entry.js` | Prod entrypoint (migrate → serve) |
| `.github/workflows/release.yml` | Builds + pushes multi-arch image to GHCR on tag/`main` |

## Env vars

| Var | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Better Auth session signing secret. Required. |
| `ENCRYPTION_KEY` | HKDF master for credential encryption. Required. |
| `AUTH_URL` | Public origin (OAuth redirects). |
| `OIDC_ISSUER` | OIDC issuer URL (any standards-compliant provider). |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OIDC client creds. |
| `PORT` | Default `3000`. |
