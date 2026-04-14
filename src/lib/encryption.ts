import { hkdfSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const VERSION = 'v1'
const IV_LEN = 12
const KEY_LEN = 32
const TAG_LEN = 16
const HKDF_INFO = 'homelab-agent/source-creds/v1'

let cachedKey: Buffer | null = null

function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('ENCRYPTION_KEY env var is required for credential encryption')
  }
  const ikm = Buffer.from(raw, 'utf8')
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), HKDF_INFO, KEY_LEN))
}

function key(): Buffer {
  if (!cachedKey) cachedKey = deriveKey()
  return cachedKey
}

function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`)
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const body = Buffer.concat([ct, tag]).toString('base64')
  return `${VERSION}:${iv.toString('base64')}:${body}`
}

export function decrypt(value: string): string {
  if (!isEncrypted(value)) {
    throw new Error('Value is not encrypted with the current scheme')
  }
  const parts = value.split(':')
  if (parts.length !== 3) throw new Error('Malformed ciphertext envelope')
  const iv = Buffer.from(parts[1]!, 'base64')
  const body = Buffer.from(parts[2]!, 'base64')
  if (body.length < TAG_LEN) throw new Error('Ciphertext truncated')
  const ct = body.subarray(0, body.length - TAG_LEN)
  const tag = body.subarray(body.length - TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : decrypt(value)
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : encrypt(value)
}
