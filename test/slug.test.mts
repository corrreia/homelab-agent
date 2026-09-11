import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestSlug } from '../src/lib/slug.ts'

test('suggestSlug: appends the first free numeric suffix', () => {
  assert.equal(suggestSlug('nas', []), 'nas')
  assert.equal(suggestSlug('nas', ['nas']), 'nas-2')
  assert.equal(suggestSlug('nas', ['nas', 'nas-2', 'nas-3']), 'nas-4')
})
