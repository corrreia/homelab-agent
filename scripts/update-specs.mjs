#!/usr/bin/env node
// Refresh the bundled OpenAPI specs in specs/ from their canonical upstream sources.
//
//   node scripts/update-specs.mjs        # or: pnpm run update-specs
//
// Each source is fetched, parsed (JSON or YAML), sanity-checked for an OpenAPI/Swagger
// document with paths, and written back pretty-printed. A source that fails to fetch or
// validate is reported and skipped — the existing spec is left untouched, never clobbered
// with a partial download.
//
// Not auto-refreshable (kept manual, see README):
//   - bazarr: its spec is generated at runtime by flask-restx — there is no static file in the repo.
//   - unifi-network / unifi-protect: Ubiquiti publishes these behind their portal, not a stable public URL.
//   - jellyfin: upstream's jellyfin-openapi-stable.json currently tracks the 12.0 release candidate
//     (x-jellyfin-version 12.0.0) while the shipping stable server is 10.11.x. Bundling the RC would
//     hand 10.11 users endpoints their server lacks, so jellyfin stays pinned to its 10.11 spec until
//     12.0 reaches GA. Revisit then.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

/** @type {Array<{ slug: string, out: string, url: string, format: 'json' | 'yaml' }>} */
const SOURCES = [
  { slug: 'immich', out: 'immich.json', format: 'json', url: 'https://raw.githubusercontent.com/immich-app/immich/main/open-api/immich-openapi-specs.json' },
  { slug: 'sonarr', out: 'sonarr.json', format: 'json', url: 'https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/Sonarr.Api.V3/openapi.json' },
  { slug: 'radarr', out: 'radarr.json', format: 'json', url: 'https://raw.githubusercontent.com/Radarr/Radarr/develop/src/Radarr.Api.V3/openapi.json' },
  { slug: 'prowlarr', out: 'prowlarr.json', format: 'json', url: 'https://raw.githubusercontent.com/Prowlarr/Prowlarr/develop/src/Prowlarr.Api.V1/openapi.json' },
  { slug: 'lidarr', out: 'lidarr.json', format: 'json', url: 'https://raw.githubusercontent.com/Lidarr/Lidarr/develop/src/Lidarr.Api.V1/openapi.json' },
  { slug: 'seerr', out: 'seerr.json', format: 'yaml', url: 'https://raw.githubusercontent.com/fallenbagel/jellyseerr/develop/seerr-api.yml' },
  // Portainer's Swagger 2.0 doc (matches the currently-bundled format; openapi.yaml is 3.0 but changes path/schema semantics).
  { slug: 'portainer', out: 'portainer.json', format: 'yaml', url: 'https://raw.githubusercontent.com/portainer/portainer/develop/api/docs/swagger.yaml' },
]

const SPECS_DIR = join(process.cwd(), 'specs')

const versionOf = (spec) => spec?.info?.version ?? '?'

async function refresh(source) {
  const res = await fetch(source.url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const spec = source.format === 'yaml' ? yaml.load(text) : JSON.parse(text)

  if (!spec || typeof spec !== 'object') throw new Error('response did not parse to an object')
  if (!spec.openapi && !spec.swagger) throw new Error('missing openapi/swagger version field')
  if (!spec.paths || Object.keys(spec.paths).length === 0) throw new Error('no paths in document')

  const outPath = join(SPECS_DIR, source.out)
  let oldVersion = '(new)'
  try {
    oldVersion = versionOf(JSON.parse(readFileSync(outPath, 'utf-8')))
  } catch {
    // No existing spec — first write.
  }

  writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n')
  return { oldVersion, newVersion: versionOf(spec), paths: Object.keys(spec.paths).length }
}

let updated = 0
let failed = 0
for (const source of SOURCES) {
  try {
    const { oldVersion, newVersion, paths } = await refresh(source)
    console.log(`✓ ${source.slug.padEnd(10)} ${String(oldVersion).padEnd(10)} → ${String(newVersion).padEnd(10)} (${paths} paths)`)
    updated++
  } catch (err) {
    console.error(`✗ ${source.slug.padEnd(10)} ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

console.log(`\n${updated} updated, ${failed} failed.`)
console.log('Manual (not fetched): bazarr, jellyfin (pinned to 10.11 until 12.0 GA), unifi-network/*, unifi-protect/*.')
if (failed > 0) process.exitCode = 1
