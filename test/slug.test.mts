import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugForLabel, slugify, suggestSlug } from '../src/lib/slug.ts'

// The repos accept exactly this shape; every slugify result must satisfy it or be empty.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

test('slugify: lowercases, folds accents and joins words with hyphens', () => {
  assert.equal(slugify('NAS'), 'nas')
  assert.equal(slugify('Proxmox — Bobby'), 'proxmox-bobby')
  assert.equal(slugify('Tomás Server'), 'tomas-server')
  assert.equal(slugify('  spaced   out  '), 'spaced-out')
})

test('slugify: output always satisfies the repo slug rule, or is empty', () => {
  for (const label of ['NAS', '2nd Rack', '...', '—', 'a', 'Ünïcödé Box', '99 bottles']) {
    const slug = slugify(label)

    assert.ok(slug === '' || SLUG_RE.test(slug), `${label} -> ${slug}`)
  }
})

test('slugify: strips leading punctuation and trailing hyphens', () => {
  assert.equal(slugify('-leading'), 'leading')
  assert.equal(slugify('trailing-'), 'trailing')
  assert.equal(slugify('!!!'), '')
})

test('suggestSlug: appends the first free numeric suffix', () => {
  assert.equal(suggestSlug('nas', []), 'nas')
  assert.equal(suggestSlug('nas', ['nas']), 'nas-2')
  assert.equal(suggestSlug('nas', ['nas', 'nas-2', 'nas-3']), 'nas-4')
})

test('slugForLabel: combines both, and yields nothing for an unusable label', () => {
  assert.equal(slugForLabel('NAS', []), 'nas')
  assert.equal(slugForLabel('NAS', ['nas']), 'nas-2')
  assert.equal(slugForLabel('!!!', []), '')
})
