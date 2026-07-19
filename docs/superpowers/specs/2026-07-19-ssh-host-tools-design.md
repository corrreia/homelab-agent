# SSH host tools (design)

Date: 2026-07-19
Status: approved

## Goal

Give the agent first-class SSH access to homelab hosts, alongside the OpenAPI
sources. The agent holds its own private key; hosts are registered in the UI like
sources; the LLM gets shell + file tools over the same authenticated `/mcp`
endpoint:

```
remote-bash("nas", "ls -la")
remote-read("nas", "/etc/fstab")
remote-edit("nas", "/etc/fstab", oldStr, newStr)
remote-write("proxmox", "/tmp/x.sh", contents)
```

## Decisions (locked)

- **Exposure:** separate MCP tools (not a sandbox provider), registered on the same
  `McpServer` instance that `openApiMcpServer()` returns.
- **Safety:** reuse `mcp-elicitation.ts`. `remote-bash/edit/write` confirm once per run
  per host; `remote-read` is unconfirmed (bounded single-file read).
- **Fail mode (differs from HTTP writes):** SSH mutating tools **fail closed** when the
  client cannot elicit — shell access is too high-stakes to run unattended. `remote-read`
  still works.
- **Key:** one shared agent **ed25519** keypair, generated in-app, private key encrypted
  at rest; public key shown for the operator to add to each host's `authorized_keys`.
- **No RBAC change:** tools are reachable only through the already-auth-gated `/mcp`.

## Data model

- **`hosts` table** (Drizzle migration): `slug` (unique handle, e.g. `nas`), `label`,
  `hostname`, `port` (default 22), `username`, `createdAt`. No per-host secret.
- **`agent_identity` singleton row:** `privateKey` (AES-GCM encrypted via
  `src/lib/encryption.ts`, never logged/returned), `publicKey` (plaintext), `knownHosts`
  (JSON map of `hostname:port -> pinned host public key`, for TOFU), `createdAt`.
- **`src/lib/hosts-repo.ts`** is the only module that reads/writes host rows and the
  identity key columns — mirrors the `sources-repo.ts` encryption boundary.

## Key management

- `src/lib/ssh-identity.ts`: `ensureIdentity()` generates an ed25519 keypair on first use
  (Node `crypto.generateKeyPairSync('ed25519')`, exported to OpenSSH authorized_keys format
  for the public side), stores it via `hosts-repo`, returns the public key. `regenerate()`
  rotates (operator must re-add the new pubkey to hosts) and clears `knownHosts`.

## MCP tools

A proper remote mirror of the coding-agent toolkit (Read/Write/Edit/Bash/Glob/Grep) — same
ergonomics, executed over SSH. Registered in `buildMcpServer` on the `McpServer` after
`openApiMcpServer` creates it.

| Tool | Args (zod) | Confirm | Mirrors | Returns |
|---|---|---|---|---|
| `remote-bash` | `host, command, timeout?` | yes (per run/host) | Bash | `{ stdout, stderr, exitCode }` |
| `remote-read` | `host, path, offset?, limit?` | no | Read | `cat -n`-style numbered lines |
| `remote-write` | `host, path, content` | yes | Write | `{ ok, bytes }` |
| `remote-edit` | `host, path, old_string, new_string, replace_all?` | yes | Edit | `{ ok, replacements }` |
| `remote-glob` | `host, pattern, path?` | no | Glob | matching paths (via `find`) |
| `remote-grep` | `host, pattern, path?, glob?, ignore_case?` | no | Grep | matches (via `rg`, fallback `grep -rn`) |

- **Read** returns numbered lines (`cat -n` style) with `offset`/`limit`, like the agent
  Read tool. **Edit** requires `old_string` to occur exactly once unless `replace_all`.
  **Glob/Grep** are reads (unconfirmed); **Bash/Write/Edit** are mutating (confirmed).
- Output/content **capped ~6k tokens** (matching codemode truncation) so a large read
  can't blow up context; truncation is marked.
- Unknown `host` slug → model-actionable error listing known hosts.
- Implementation runs the read/search helpers as SSH commands (`sed -n`, `find`, `rg`);
  Read/Write/Edit fetch and store file bytes over SFTP for exactness and atomic writes.

## SSH execution layer (`src/lib/ssh.ts`)

- **`ssh2`** library. One-shot `exec` per call; connection may be reused within a run.
- **Host-key TOFU:** first connect pins the server key into `agent_identity.knownHosts`;
  later connects verify. **Mismatch fails hard** (possible MITM) — surfaced as an error.
- Per-command **timeout** (default 30s), non-interactive only (no TTY/password prompts).
  `sudo` works only if the host's authorized user has passwordless sudo.
- `remote-edit` = read file (sftp) → require `old_string` to occur **exactly once** (else
  error) → write modified content atomically (temp file + `mv`). `remote-write` = atomic
  full write.

## Safety wiring

- Generalize `confirmWrite(...)` in `mcp-elicitation.ts` → `confirmAction(context,
  resourceKey, label, clientSupportsElicitation, warn, { failClosed })`. HTTP writes call it
  with `resourceKey = "src:<slug>"`, `failClosed:false`; SSH calls it with
  `resourceKey = "host:<slug>"`, `failClosed:true`. Once-per-run-per-resource grant cache is
  unchanged. Prompt shows host + command/path.

## UI (revamp)

- **Home page revamp:** two clear sections — **Sources** and **Hosts** — each a card list
  with add/remove and health/reachability. Add a Host: slug, hostname, port, username,
  "Test connection" (runs `whoami` over SSH, reports auth + reachability).
- **Settings → SSH Identity** page: shows the public key with Copy, install hint, and a
  guarded Regenerate.
- Keep the project's inline-style/design-token conventions (`src/styles.ts`).

## Footprint

- New deps: `ssh2`, `@types/ssh2`.
- New: `hosts-repo.ts`, `ssh.ts`, `ssh-identity.ts`, migration, host route(s), settings
  route, host template/logo bits as needed.
- Touched: `mcp-server.ts` (register 4 tools), `mcp-elicitation.ts` (generalize helper),
  `db/schema.ts`, home route (revamp), `AGENTS.md`.

## Testing

`node:test` units: host-key TOFU (pin / match / mismatch→reject), `remote-edit` string
replace (unique / missing / multiple→error), generalized `confirmAction` (incl.
`failClosed` path), output truncation, ed25519 keygen → valid OpenSSH public key. Live SSH
round-trip against a throwaway `sshd` (or `ssh2` in-process server) as a manual harness.

## Risk

Highest-trust surface in the app: an LLM with the key can run anything on the hosts, and a
malicious API response from a source could prompt-inject a destructive `remote-bash`.
Elicitation + fail-closed is the backstop. The agent private key is the crown-jewel secret —
encrypted at rest, never logged, never returned by any endpoint.
