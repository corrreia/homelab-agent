import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEdit,
  buildFindCommand,
  buildGrepCommand,
  classifyHostKey,
  classifySearchExit,
  formatNumberedLines,
  safePath,
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

test('buildFindCommand: bare pattern matches by -name, quoted', () => {
  assert.equal(buildFindCommand('*.conf', '/etc'), `find '/etc' -type f -name '*.conf'`)
})

test('buildFindCommand: pattern with a directory part is anchored under the root via -path', () => {
  assert.equal(buildFindCommand('a/*.txt', '/g'), `find '/g' -type f -path '/g/a/*.txt'`)
  assert.equal(buildFindCommand('**/*.log', '/var/'), `find '/var/' -type f -path '/var/*.log'`)
  assert.equal(buildFindCommand('src/**/x.ts', '.'), `find '.' -type f -path './src/*x.ts'`)
})

test('safePath: a leading dash can never become a find action or grep option', () => {
  assert.equal(safePath('-delete'), './-delete')
  assert.equal(safePath('/etc'), '/etc')
  assert.equal(buildFindCommand('*.log', '-delete'), `find './-delete' -type f -name '*.log'`)
  assert.match(buildGrepCommand('x', { path: '--version' }), /-- '\.\/--version'/)
})

test('buildGrepCommand: prefers rg, falls back to grep -E, path after --', () => {
  const cmd = buildGrepCommand('TODO', { path: '/srv', ignoreCase: true, glob: '*.ts' })
  assert.match(cmd, /command -v rg/)
  assert.match(cmd, /rg --line-number --no-heading -i -g '\*\.ts' -e 'TODO' -- '\/srv'/)
  assert.match(cmd, /grep -rnE -i --include='\*\.ts' -e 'TODO' -- '\/srv'/)
})

test('classifySearchExit: rg/grep exit-code contract', () => {
  assert.equal(classifySearchExit(0), 'matches')
  assert.equal(classifySearchExit(1), 'none')
  assert.equal(classifySearchExit(2), 'error')
})

test('classifyHostKey: TOFU verdicts', () => {
  assert.equal(classifyHostKey(undefined, 'KEY'), 'new')
  assert.equal(classifyHostKey('KEY', 'KEY'), 'match')
  assert.equal(classifyHostKey('KEY', 'OTHER'), 'mismatch')
})
