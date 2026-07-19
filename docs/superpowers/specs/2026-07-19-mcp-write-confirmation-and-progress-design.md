# MCP write-confirmation + progress (design)

Date: 2026-07-19
Status: approved

## Goal

Take advantage of the one `@cloudflare/codemode` 0.4.x capability reachable in this
project's Node deployment: the MCP request context now passed to the
`openApiMcpServer` `request` callback (`OpenApiMcpRequestContext =
RequestHandlerExtra<ServerRequest, ServerNotification>`). Use it to add, on the
`execute` path:

1. **Human-in-the-loop confirmation** before mutating (write/delete) calls hit a
   homelab service — a real guardrail given the project has **no RBAC** (any
   authenticated user is effectively admin).
2. **Progress notifications** during long batch runs so clients get a heartbeat
   instead of a silent hang.

Both are additive. Reads and non-elicitation clients keep working exactly as today.

## Non-goals (YAGNI)

- No per-source config, no new env vars, no RBAC.
- No gating of read (GET/HEAD) calls.
- No persistence of approvals across runs.
- No changes to the DB schema, the web UI, or the proxy route.

## Constraints / facts this design relies on

- The `execute` sandbox runs arbitrary model JS that may make **many**
  `codemode.request()` calls in one tool-call, each routed through the host
  `makeRequest(options, context)` callback (`src/lib/mcp-server.ts`).
- Within one `execute` tool-call, **every** `makeRequest` invocation receives the
  **same** `context` object instance (the tool handler's `RequestHandlerExtra`).
  That object identity is the natural per-run key.
- The callback runs while the sandbox is suspended on `codemode.request()`, so the
  wait counts against the executor timeout (`QuickJsExecutor`, currently 30s).
- MCP SDK primitives confirmed available:
  - `context.sendRequest(req, schema, opts)` — elicitation, bound to the response stream.
  - `context.sendNotification(n)` + `context._meta?.progressToken` — progress.
  - `context.signal: AbortSignal` — client cancellation.
  - `server.server.getClientCapabilities()?.elicitation` — capability detection.

## Behavior

### Confirmation

- **Trigger:** `options.method ∈ {POST, PUT, PATCH, DELETE}`. GET/HEAD pass through untouched.
- **Granularity — once per run, per source:** a module-level
  `WeakMap<object /*context*/, Map<slug, 'granted' | 'denied'>>`. First mutating call
  to a source elicits; the decision is cached for the remainder of that run. WeakMap
  keying auto-releases the state when the run's context is GC'd (no manual cleanup).
- **Elicitation:** `context.sendRequest` with `method: 'elicitation/create'`, a human
  message (`Allow writes to "<source>" for this execution?` plus the triggering
  `METHOD path`), and a minimal `requestedSchema` (single boolean/accept). Uses
  `sendRequest` — not the server-level helper — so the prompt binds to the originating
  stream (the reason codemode threads the context through).
- **Capability check / fallback:** if `getClientCapabilities()?.elicitation` is absent →
  **fail open + warn**: the write proceeds and a warning is logged
  (`unconfirmed write — client has no elicitation support`).
- **Reject / timeout / cancel:** a decline, an elicitation timeout, or a
  `context.signal` abort → cache `'denied'` for that source and **throw**, so the
  sandbox sees an error (`Write to <source> denied`). Further writes to that source in
  the same run fail fast without re-prompting.

### Progress

- When `context._meta?.progressToken` is present, each host `request()` emits
  `notifications/progress` with an incrementing `progress` count and a
  `message` of `METHOD <source><path>` — an indeterminate heartbeat + activity trail
  (the host cannot know the total; the sandbox loops arbitrarily). No token → skip.

### Executor timeout

Bump `QuickJsExecutor` default timeout 30s → **120s**, and give the elicitation request
its own ~90s timeout, so a slow human times out the *prompt* (→ denied) rather than
killing the whole run.

## Code shape

- `src/lib/mcp-elicitation.ts` (new): `isMutatingMethod()`, the per-run grant WeakMap,
  `confirmWrite(context, source, options, clientSupportsElicitation)`, and
  `emitProgress(context, n, label)`. Pure-ish, unit-testable.
- `src/lib/mcp-server.ts`: `buildMcpServer` closes over the `McpServer` so `makeRequest`
  can read client capabilities; `makeRequest(options, context)` calls `confirmWrite`
  before issuing a mutating request and `emitProgress` on every call.
- `src/lib/quickjs-executor.ts`: default timeout constant 30_000 → 120_000.

## Testing

Node's built-in test runner (`node:test`) run via `tsx` — no vitest.
`test/mcp-elicitation.test.mts` unit-tests the helpers (`isMutatingMethod`,
`confirmWrite`, `emitProgress`) against a stubbed context, asserting:

1. Mutating methods are flagged, reads are not.
2. First write to a source elicits; a second write to the same source does not (cached).
3. Decline / accept-without-approve / elicitation error → denied and cached.
4. A client without `elicitation` capability: writes still succeed, warning logged once.
5. `emitProgress` sends an incrementing `notifications/progress` only when a token was supplied.

The live elicitation round-trip (real `openApiMcpServer` + `QuickJsExecutor` +
in-memory `Client`/`Server`) is exercised as a manual verification harness during
development (approve / decline / no-elicitation paths).

`package.json`: add `tsx` devDependency (make the transitive explicit) and a
`"test": "tsx --test test/*.test.mts"` script.
