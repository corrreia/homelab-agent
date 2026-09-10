#!/usr/bin/env node
// Refresh the bundled OpenAPI specs in specs/ from their canonical upstream sources.
//
//   node scripts/update-specs.mjs        # or: pnpm run update-specs
//
// Each source is pinned to its repo's latest stable GitHub release — not a dev branch, which
// carries unreleased (or RC) endpoints users' servers don't have yet — then fetched, parsed
// (JSON or YAML), sanity-checked for an OpenAPI/Swagger document with paths, and written back
// pretty-printed. A source that fails to fetch or validate is reported and skipped — the
// existing spec is left untouched, never clobbered with a partial download.
//
// Not auto-refreshable (kept manual, see README):
//   - bazarr: its spec is generated at runtime by flask-restx — there is no static file in the repo.
//   - unifi-network / unifi-protect: Ubiquiti publishes these behind their portal, not a stable public URL.
//     Versioned files are mirrored from github.com/beezly/unifi-apis; only add versions that are on
//     Ubiquiti's release channel (fw-update.ui.com).
//   - jellyfin: versioned like UniFi (specs/jellyfin/<version>.json, picked per source) because 12.0
//     dropped endpoints that 10.11 servers still serve. Stable specs live at
//     https://repo.jellyfin.org/files/openapi/stable/jellyfin-openapi-<version>.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

/** @type {Array<{ slug: string, out: string, repo: string, path: string, format: 'json' | 'yaml' }>} */
const SOURCES = [
  {
    slug: 'immich',
    out: 'immich.json',
    format: 'json',
    repo: 'immich-app/immich',
    path: 'open-api/immich-openapi-specs.json',
  },
  { slug: 'sonarr', out: 'sonarr.json', format: 'json', repo: 'Sonarr/Sonarr', path: 'src/Sonarr.Api.V3/openapi.json' },
  { slug: 'radarr', out: 'radarr.json', format: 'json', repo: 'Radarr/Radarr', path: 'src/Radarr.Api.V3/openapi.json' },
  {
    slug: 'prowlarr',
    out: 'prowlarr.json',
    format: 'json',
    repo: 'Prowlarr/Prowlarr',
    path: 'src/Prowlarr.Api.V1/openapi.json',
  },
  { slug: 'lidarr', out: 'lidarr.json', format: 'json', repo: 'Lidarr/Lidarr', path: 'src/Lidarr.Api.V1/openapi.json' },
  { slug: 'seerr', out: 'seerr.json', format: 'yaml', repo: 'seerr-team/seerr', path: 'seerr-api.yml' },
  // Portainer's Swagger 2.0 doc (matches the currently-bundled format; openapi.yaml is 3.0 but changes path/schema semantics).
  {
    slug: 'portainer',
    out: 'portainer.json',
    format: 'yaml',
    repo: 'portainer/portainer',
    path: 'api/docs/swagger.yaml',
  },
]

const SPECS_DIR = join(process.cwd(), 'specs')

const versionOf = (spec) => spec?.info?.version ?? '?'

// GitHub's /releases/latest skips prereleases and redirects to the tag — no API token or rate limit.
async function latestReleaseTag(repo) {
  const res = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: 'manual' })
  const tag = res.headers.get('location')?.match(/\/releases\/tag\/([^/?#]+)$/)?.[1]
  if (!tag) throw new Error(`could not resolve latest release (HTTP ${res.status})`)
  return decodeURIComponent(tag)
}

async function refresh(source) {
  const tag = await latestReleaseTag(source.repo)
  const res = await fetch(`https://raw.githubusercontent.com/${source.repo}/${tag}/${source.path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source.path} at ${tag}`)
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
  return { tag, oldVersion, newVersion: versionOf(spec), paths: Object.keys(spec.paths).length }
}

let updated = 0
let failed = 0
for (const source of SOURCES) {
  try {
    const { tag, oldVersion, newVersion, paths } = await refresh(source)
    console.log(
      `✓ ${source.slug.padEnd(10)} ${String(oldVersion).padEnd(10)} → ${String(newVersion).padEnd(10)} (release ${tag}, ${paths} paths)`,
    )
    updated++
  } catch (err) {
    console.error(`✗ ${source.slug.padEnd(10)} ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

console.log(`\n${updated} updated, ${failed} failed.`)
console.log('Manual (not fetched): bazarr, jellyfin/*, unifi-network/*, unifi-protect/*.')
if (failed > 0) process.exitCode = 1
