# Upstream provenance

## Anti-slop plugin

- Source repository: unknown. The bundled installer does not identify a source repository.
- Source revision: unknown. No source commit was included with the bundled plugin snapshot.
- Pristine snapshot used for this installation: `/home/correia/.pi/agent/skills/install-anti-slop/assets/anti-slop/`.
- Snapshot tree SHA-256: `b79e26e80b091f45afbad2942f8d8f0ea2f5c0307d2f39502a01c17596d052be`. This hashes each sorted relative file path and its SHA-256 digest before this provenance file was added.
- Installed generic entry point: `tools/oxlint/anti-slop/index.ts`.
- Installed optional Effect entry point: `tools/oxlint/anti-slop/effect/index.ts`.

## Intentional deviations

- No files from the bundled snapshot were changed during installation.
- The optional Effect plugin is present in the vendored snapshot but is not registered because this repository does not directly depend on `effect`.
- This provenance file was added beside the generic entry point as installation metadata.

The separately vendored ESLint Stylistic-derived readability code retains its own license and exact upstream commit record in `vendor/eslint-stylistic/`.
