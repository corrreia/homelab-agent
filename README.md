<div align="center">
  <img src="public/favicon.svg" alt="Homelab Agent" width="96" height="96" />
  <h1>homelab-agent</h1>
  <p>One MCP endpoint for every service in your homelab.</p>
</div>

---

Homelab Agent is a self-hosted gateway that aggregates the OpenAPI specs of your homelab services (Jellyfin, Sonarr, Radarr, Prowlarr, Lidarr, Bazarr, Overseerr, UniFi, Immich, Portainer, …) and exposes them behind **a single authenticated MCP endpoint**, so an LLM can control the whole rack without you shipping API keys around. It ships with a small web UI for adding sources and watching their health.

## Powered by Cloudflare Code Mode

The MCP layer is built on [`@cloudflare/codemode`](https://www.npmjs.com/package/@cloudflare/codemode). Code Mode flips the usual MCP model: instead of presenting every endpoint as a separate tool, it hands the LLM a typed TypeScript SDK derived from the OpenAPI spec and lets it **write and execute code** in a sandboxed VM. Cloudflare reports ~32% token savings on simple tasks and **81% on complex batch operations**.

- [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/) (Sep 2025) — the original pattern.
- [Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/) (Mar 2026) — 99.9% token reduction for the full Cloudflare API.
- [Codemode reference](https://developers.cloudflare.com/agents/api-reference/codemode/) — canonical docs.

As a result, an MCP client connected to homelab-agent gets **two** tools (`search` and `execute`) instead of hundreds: the model searches the combined spec, writes a snippet, and the executor runs it against your real services.

## Running it

### Prerequisites

- Node 22+ and [pnpm](https://pnpm.io/).
- An OIDC provider you control. Any standards-compliant issuer works — [Pocket ID](https://pocket-id.org/), Authentik, Keycloak, Auth0, Dex, Google, Okta, …

### Configure

```bash
cp .env.example .env
```

Fill in:

- `ENCRYPTION_KEY` — `openssl rand -base64 32`. Used as Better Auth's session signing key **and** as the HKDF master for encrypting source credentials at rest.
- `AUTH_URL` — the public origin where this app is reachable (used in OAuth redirects). Defaults to `http://localhost:3000`.
- `OIDC_ISSUER` — your provider's issuer URL. Better Auth fetches `/.well-known/openid-configuration` from here.
- `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` — register a client in your provider with redirect URI `${AUTH_URL}/api/auth/oauth2/callback/oidc`.

### Dev

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000>, sign in with your OIDC provider, and add your first source from the home page — pick a bundled template (Jellyfin, Sonarr, Radarr, …) or point at any OpenAPI spec URL.

### Production (Docker)

Published images live at `ghcr.io/corrreia/homelab-agent` — tags follow semver (`:0.0.1`, `:0.0`, `:0`, `:latest`) plus a `:edge` rolling tag from `main`.

Minimal `docker-compose.yml`:

```yaml
services:
  homelab-agent:
    image: ghcr.io/corrreia/homelab-agent:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    env_file: .env
    volumes:
      - ./data:/app/data  # SQLite database lives here; migrations are baked into the image
```

`.env` alongside `docker-compose.yml`:

```env
PORT=3000
ENCRYPTION_KEY=<openssl rand -base64 32>
AUTH_URL=https://homelab-agent.example.com

OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=<from your provider>
OIDC_CLIENT_SECRET=<from your provider>
```

Then:

```bash
docker compose pull
docker compose up -d
```

The image runs pending Drizzle migrations on boot and serves on `PORT`.

### Production (Node)

```bash
pnpm install
pnpm build
pnpm start
```

`server.entry.js` runs pending migrations, then serves the built app.

### Deployment example (reverse-proxied, TLS, OIDC)

A typical homelab deployment:

1. Point a DNS name (e.g. `homelab-agent.example.com`) at your reverse proxy.
2. In your OIDC provider, register a client with redirect URI `https://homelab-agent.example.com/api/auth/oauth2/callback/oidc` and grab client id/secret.
3. Create a working dir and drop in the `docker-compose.yml` above + `.env` with `AUTH_URL=https://homelab-agent.example.com` and the OIDC creds.
4. `docker compose up -d`.
5. Put it behind your reverse proxy. Caddy example:

   ```caddy
   homelab-agent.example.com {
     reverse_proxy localhost:3000
   }
   ```

   nginx is equivalent — standard `proxy_pass` to `http://127.0.0.1:3000`. No special headers required.

6. Visit the URL, sign in via OIDC, add your first source.

Upgrades:

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on boot. The `./data` volume persists across upgrades; the `ENCRYPTION_KEY` must stay stable or stored source credentials become unreadable.

## Contributing

PRs and issues welcome!!!

### Local setup

```bash
pnpm install
cp .env.example .env   # fill in as above
pnpm db:migrate
pnpm dev
```

### Checks

```bash
pnpm lint              # oxlint
pnpm format:check      # oxfmt
pnpm exec tsc --noEmit # typecheck
```

Husky + lint-staged run `oxfmt` and `oxlint --fix` on staged files.

### Adding a built-in source template

1. Drop the OpenAPI spec into `specs/<name>.json`.
2. Register it in `src/lib/templates.ts` (declare `kind`, default `baseUrl`, auth shape, optional `publicPathPrefix`).
3. Reference the spec in `src/lib/bundled-specs.ts` so it's inlined at build time.

Custom sources (no template) can pull their spec at runtime from any URL.

### Schema changes

```bash
# Edit src/db/schema.ts, then:
pnpm db:generate       # produces a new file under data/migrations/
pnpm db:migrate        # applies it locally
```

Commit the generated migration with your schema change.

### Security expectations for PRs

- **Never log decrypted source credentials.** The encryption boundary is `src/lib/sources-repo.ts`; don't bypass it.
- **Every new route under `src/routes/api/*` must call `requireApiSession(request)`** before doing work.
- **Response headers on `/api/proxy` are allow-listed** (`src/lib/proxy.ts`). Add entries to the allowlist intentionally, never remove the filter.