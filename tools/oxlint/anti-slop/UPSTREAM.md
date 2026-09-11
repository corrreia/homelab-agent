# Upstream provenance

## Anti-slop plugin

- Source repository: unknown. The bundled installer does not identify a source repository.
- Source revision: unknown. No source commit was included with the bundled plugin snapshot.
- Pristine snapshot used for this installation: `/home/correia/.pi/agent/skills/install-anti-slop/assets/anti-slop/`.
- Snapshot tree SHA-256: `b79e26e80b091f45afbad2942f8d8f0ea2f5c0307d2f39502a01c17596d052be`. This hashes each sorted relative file path and its SHA-256 digest before this provenance file was added.
- Installed generic entry point: `tools/oxlint/anti-slop/index.ts`.
- Installed optional Effect entry point: `tools/oxlint/anti-slop/effect/index.ts`.

### Reproducible tree digest

Run from the directory being hashed; excludes this provenance file:

```bash
find . -type f ! -name UPSTREAM.md | sort | xargs sha256sum | sha256sum
```

Current value for the installed tree: `44a6f958c61f71d0597f5af11f20610c24f2f3f4a27e8396ebf892744f00b503`.

The `b79e26e8…` value recorded above could not be independently recomputed, because the exact
hashing procedure behind it is not specified. Byte-level comparison was used instead and is the
stronger evidence; prefer the reproducible digest above for future updates.

## Update history

### 2026-09-11 — reviewed against the `~/.claude` skill bundle, nothing adopted

- Incoming source identity: the bundle shipped with `/home/correia/.claude/skills/install-anti-slop/`
  (a different skill location than the original `~/.pi/...` install), staged to a temporary directory
  rather than over the live installation.
- Base: the original `~/.pi/agent/skills/install-anti-slop/assets/anti-slop/` snapshot, still present
  on disk, so this was a true three-way comparison rather than a base-less port.
- Result: **no changes adopted, because there were none to adopt.** Base, incoming and installed trees
  are byte-identical (38 files each, digest `44a6f958…`); `diff -r` reports no differences in either
  direction. The two skill locations ship the same snapshot.
- Local deviations confirmed unchanged: no vendored file has been edited; the only local addition is
  this provenance file.
- Configuration and dependencies: unchanged and verified, not rewritten. All 19 generic rules plus the
  native companion `oxc/no-accumulating-spread` are registered at `error`; ignores and the single
  `jsPlugins` entry are intact; `oxlint` and `@oxlint/plugins` are both pinned at exactly `1.60.0`.
- Effect plugin: still deliberately unregistered. This repository has no direct `effect` dependency.
- Verification: the registered plugin was exercised on a throwaway file — a `value as string` on an
  `unknown` parameter produced `no-unknown-parameters` and `require-safety-comment-for-type-assertion`,
  while a clean equivalent produced none. Repo checks: 31 unit tests pass; typecheck holds at its 24
  known TanStack Start server-function errors.
- Pending: nothing from upstream. Separately, `pnpm lint` reports 329 pre-existing violations in
  application code untouched by this review (mostly `require-readable-spacing`); cleaning those up is a
  product decision, not an update step.
- Baseline: unchanged and still accurate, since the incoming snapshot was identical.

## Intentional deviations

- No files from the bundled snapshot were changed during installation.
- The optional Effect plugin is present in the vendored snapshot but is not registered because this repository does not directly depend on `effect`.
- This provenance file was added beside the generic entry point as installation metadata.

The separately vendored ESLint Stylistic-derived readability code retains its own license and exact upstream commit record in `vendor/eslint-stylistic/`.
