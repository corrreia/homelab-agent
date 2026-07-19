import { test } from 'node:test'
import assert from 'node:assert/strict'
import ssh2 from 'ssh2'
import { generateAgentKeyPair } from '../src/lib/ssh-keys.ts'

const { utils } = ssh2

test('generates an ed25519 authorized_keys line with the given comment', () => {
  const { publicKey } = generateAgentKeyPair('my-agent')
  const [type, b64, comment] = publicKey.split(' ')
  assert.equal(type, 'ssh-ed25519')
  assert.match(b64!, /^AAAAC3NzaC1lZDI1NTE5/) // ed25519 SSH wire-format prefix
  assert.equal(comment, 'my-agent')
})

test('private key is OpenSSH format and parseable by ssh2 (usable for auth)', () => {
  const { privateKey } = generateAgentKeyPair()
  assert.match(privateKey, /^-----BEGIN OPENSSH PRIVATE KEY-----/)
  const parsed = utils.parseKey(privateKey)
  assert.ok(!(parsed instanceof Error), 'ssh2 should parse the private key')
  assert.equal(Array.isArray(parsed) ? parsed[0]!.type : parsed.type, 'ssh-ed25519')
})

test('each call produces a distinct keypair', () => {
  assert.notEqual(generateAgentKeyPair().publicKey, generateAgentKeyPair().publicKey)
})
