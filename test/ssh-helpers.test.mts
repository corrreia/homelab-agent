import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEdit,
  buildFindCommand,
  buildGrepCommand,
  classifyHostKey,
  formatNumberedLines,
  shellQuote,
} from '../src/lib/ssh-helpers.ts'

test('formatNumberedLines: cat -n style, honours offset/limit', () => {
  const content = 'a\nb\nc\nd'
  assert.equal(formatNumberedLines(content).split('\n').length, 4)
  assert.match(formatNumberedLines(content), /^\s+1\ta$/m)
  const window = formatNumberedLines(content, 2, 2)
  assert.equal(window, '     2\tb\n     3\tc')
})

test('applyEdit: unique match replaces once', () => {
  const r = applyEdit('foo bar baz', 'bar', 'BAR')
  assert.equal(r.result, 'foo BAR baz')
  assert.equal(r.replacements, 1)
})

test('applyEdit: missing old_string throws', () => {
  assert.throws(() => applyEdit('abc', 'x', 'y'), /not found/)
})

test('applyEdit: non-unique without replace_all throws; replace_all replaces all', () => {
  assert.throws(() => applyEdit('a a a', 'a', 'b'), /not unique \(3 matches\)/)
  const r = applyEdit('a a a', 'a', 'b', true)
  assert.equal(r.result, 'b b b')
  assert.equal(r.replacements, 3)
})

test('applyEdit: identical strings throw', () => {
  assert.throws(() => applyEdit('x', 'a', 'a'), /identical/)
})

test('shellQuote escapes embedded single quotes', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`)
})

test('buildFindCommand: uses -name of the last glob segment, quoted', () => {
  assert.equal(buildFindCommand('*.conf', '/etc'), `find '/etc' -type f -name '*.conf' 2>/dev/null`)
  assert.match(buildFindCommand('**/*.log', '/var'), /-name '\*\.log'/)
})

test('buildGrepCommand: prefers rg, falls back to grep, quotes pattern/path', () => {
  const cmd = buildGrepCommand('TODO', { path: '/srv', ignoreCase: true, glob: '*.ts' })
  assert.match(cmd, /command -v rg/)
  assert.match(cmd, /rg --line-number --no-heading -i -g '\*\.ts' -e 'TODO' '\/srv'/)
  assert.match(cmd, /grep -rn -i --include='\*\.ts' -e 'TODO' '\/srv'/)
})

test('classifyHostKey: TOFU verdicts', () => {
  assert.equal(classifyHostKey(undefined, 'KEY'), 'new')
  assert.equal(classifyHostKey('KEY', 'KEY'), 'match')
  assert.equal(classifyHostKey('KEY', 'OTHER'), 'mismatch')
})
