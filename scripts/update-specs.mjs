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
//   - grafana: its spec carries `example` service-account tokens (`glsa_…`) that GitHub's secret
//     scanner blocks on push. They are documentation only, so the bundled copies replace them with
//     <example-service-account-token>. Re-apply that when refreshing a grafana version.
//   - kavita, grafana, authentik, frigate, immich/2.0.0: version-pinned files under specs/<slug>/.
//     A refresh here writes one file per source, which would silently overwrite a version-labelled
//     file with a newer version's content — so these are fetched by hand from
//     raw.githubusercontent.com/<repo>/<tag>/<path> when a new version is worth offering.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

/**
 * `pre` rewrites the raw text before parsing; `fixup` adjusts the parsed document. Both exist for
 * upstreams that don't ship a directly usable file — see gitea and grocy below.
 *
 * @type {Array<{
 *   slug: string, out: string, repo: string, path: string, format: 'json' | 'yaml',
 *   pre?: (text: string, tag: string) => string, fixup?: (spec: object) => void,
 * }>}
 */
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
  { slug: 'komga', out: 'komga.json', format: 'json', repo: 'gotson/komga', path: 'komga/docs/openapi.json' },
  {
    slug: 'audiobookshelf',
    out: 'audiobookshelf.json',
    format: 'json',
    repo: 'advplyr/audiobookshelf',
    path: 'docs/openapi.json',
  },
  {
    slug: 'karakeep',
    out: 'karakeep.json',
    format: 'json',
    repo: 'karakeep-app/karakeep',
    path: 'packages/open-api/karakeep-openapi-spec.json',
  },
  { slug: 'gotify', out: 'gotify.json', format: 'json', repo: 'gotify/server', path: 'docs/spec.json' },
  {
    slug: 'photoprism',
    out: 'photoprism.json',
    format: 'json',
    repo: 'photoprism/photoprism',
    path: 'internal/api/swagger.json',
  },
  {
    slug: 'netdata',
    out: 'netdata.json',
    format: 'json',
    repo: 'netdata/netdata',
    path: 'src/web/api/netdata-swagger.json',
  },
  { slug: 'semaphore', out: 'semaphore.json', format: 'yaml', repo: 'semaphoreui/semaphore', path: 'api-docs.yml' },
  {
    slug: 'vikunja',
    out: 'vikunja.json',
    format: 'json',
    repo: 'go-vikunja/vikunja',
    path: 'pkg/swagger/swagger.json',
  },
  {
    slug: 'homebox',
    out: 'homebox.json',
    format: 'json',
    repo: 'sysadminsmedia/homebox',
    path: 'docs/public/api/openapi-3.0.json',
  },
  {
    slug: 'headscale',
    out: 'headscale.json',
    format: 'json',
    repo: 'juanfont/headscale',
    path: 'gen/openapiv2/headscale/v1/headscale.swagger.json',
  },
  {
    slug: 'mailcow',
    out: 'mailcow.json',
    format: 'yaml',
    repo: 'mailcow/mailcow-dockerized',
    path: 'data/web/api/openapi.yaml',
  },
  {
    slug: 'jellystat',
    out: 'jellystat.json',
    format: 'json',
    repo: 'CyferShepard/Jellystat',
    path: 'backend/swagger.json',
  },
  {
    slug: 'changedetection',
    out: 'changedetection.json',
    format: 'yaml',
    repo: 'dgtlmoon/changedetection.io',
    path: 'docs/api-spec.yaml',
  },
  { slug: 'glances', out: 'glances.json', format: 'json', repo: 'nicolargo/glances', path: 'docs/api/openapi.json' },
  { slug: 'ollama', out: 'ollama.json', format: 'yaml', repo: 'ollama/ollama', path: 'docs/openapi.yaml' },
  { slug: 'docker-engine', out: 'docker-engine.json', format: 'yaml', repo: 'moby/moby', path: 'api/swagger.yaml' },
  { slug: 'traccar', out: 'traccar.json', format: 'yaml', repo: 'traccar/traccar', path: 'openapi.yaml' },
  {
    slug: 'grocy',
    out: 'grocy.json',
    format: 'json',
    repo: 'grocy/grocy',
    path: 'grocy.openapi.json',
    // Upstream ships the literal placeholder `"xxx"` as its server URL, which would make
    // inferApiBasePath() resolve every call to /xxx. The real API lives under /api.
    fixup: (spec) => {
      spec.servers = [{ url: '/api' }]
    },
  },
  {
    slug: 'adguard-home',
    out: 'adguard-home.json',
    format: 'yaml',
    repo: 'AdguardTeam/AdGuardHome',
    path: 'openapi/openapi.yaml',
  },
  {
    slug: 'speedtest-tracker',
    out: 'speedtest-tracker.json',
    format: 'json',
    repo: 'alexjustesen/speedtest-tracker',
    path: 'openapi.json',
  },
  {
    slug: 'alertmanager',
    out: 'alertmanager.json',
    format: 'yaml',
    repo: 'prometheus/alertmanager',
    path: 'api/v2/openapi.yaml',
  },
  {
    slug: 'gitea',
    out: 'gitea.json',
    format: 'json',
    repo: 'go-gitea/gitea',
    path: 'templates/swagger/v1_json.tmpl',
    // Gitea's spec is a Go template. Both placeholders sit inside JSON strings, so substituting
    // them is enough to make the document parse: the sub-URL is empty for a root install, and the
    // version is the release tag.
    pre: (text, tag) =>
      text.replaceAll('{{.SwaggerAppSubUrl}}', '').replaceAll('{{.SwaggerAppVer}}', tag.replace(/^v/, '')),
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
  const raw = await res.text()
  const text = source.pre ? source.pre(raw, tag) : raw
  const spec = source.format === 'yaml' ? yaml.load(text) : JSON.parse(text)

  // A scalar or array parse fails the openapi/paths checks below, so a null guard is enough here.
  if (!spec) throw new Error('response did not parse to an object')

  if (!spec.openapi && !spec.swagger) throw new Error('missing openapi/swagger version field')

  if (!spec.paths || Object.keys(spec.paths).length === 0) throw new Error('no paths in document')

  source.fixup?.(spec)

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

console.log(
  'Manual (not fetched): bazarr, jellyfin/*, unifi-network/*, unifi-protect/*, ' +
    'kavita/*, grafana/*, authentik/*, frigate/*, immich/2.0.0.',
)

if (failed > 0) process.exitCode = 1
