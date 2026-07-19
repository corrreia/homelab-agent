import { eq } from 'drizzle-orm'
import { db } from '../db'
import { agentIdentity, hosts, sources } from '../db/schema'
import { decrypt, encrypt } from './encryption'
import { generateAgentKeyPair } from './ssh-keys'

const IDENTITY_ID = 'default'
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export interface Host {
  slug: string
  label: string
  hostname: string
  port: number
  username: string
  /** Pinned server host key (TOFU); null until the first successful connect. */
  hostKey: string | null
}

export interface HostInput {
  slug: string
  label?: string
  hostname: string
  port?: number
  username: string
}

function validateHostInput(input: HostInput): void {
  if (!SLUG_RE.test(input.slug)) {
    throw new Error('Host slug must be lowercase alphanumeric with hyphens (e.g. "nas")')
  }
  if (!input.hostname.trim()) throw new Error('hostname is required')
  if (input.hostname.includes('/') || input.hostname.includes(' ')) {
    throw new Error('hostname must be a bare host or IP, not a URL')
  }
  if (!input.username.trim()) throw new Error('username is required')
  const port = input.port ?? 22
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be 1–65535')
}

// ---- Hosts -----------------------------------------------------------------

export async function listHosts(): Promise<Host[]> {
  return db.select().from(hosts).all().map(toHost)
}

export async function getHost(slug: string): Promise<Host | null> {
  const row = db.select().from(hosts).where(eq(hosts.slug, slug)).get()
  return row ? toHost(row) : null
}

export async function createHost(input: HostInput): Promise<Host> {
  validateHostInput(input)
  if (await getHost(input.slug)) throw new Error(`A host with slug "${input.slug}" already exists`)
  const row = {
    slug: input.slug,
    label: input.label?.trim() || input.slug,
    hostname: input.hostname.trim(),
    port: input.port ?? 22,
    username: input.username.trim(),
  }
  db.insert(hosts).values(row).run()
  return { ...row, hostKey: null }
}

export async function deleteHost(slug: string): Promise<void> {
  // Keep the relation consistent: sources that ran on this host lose the link.
  db.update(sources).set({ hostSlug: null }).where(eq(sources.hostSlug, slug)).run()
  db.delete(hosts).where(eq(hosts.slug, slug)).run()
}

/** Pin a host's server key on trust-on-first-use, or update it after a verified rotation. */
export async function setHostKey(slug: string, hostKey: string): Promise<void> {
  db.update(hosts).set({ hostKey, updatedAt: new Date() }).where(eq(hosts.slug, slug)).run()
}

function toHost(row: typeof hosts.$inferSelect): Host {
  return {
    slug: row.slug,
    label: row.label,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    hostKey: row.hostKey,
  }
}

// ---- Agent SSH identity (encryption boundary) ------------------------------
// The private key is the crown-jewel secret: only this module decrypts it, and it is never
// logged or returned to any HTTP/MCP surface. Everything else asks for the public key or a
// signing handle via ssh.ts.

function identityRow() {
  return db.select().from(agentIdentity).where(eq(agentIdentity.id, IDENTITY_ID)).get()
}

/** Generate the keypair on first use; returns the public key (safe to display). Idempotent. */
export async function ensureAgentIdentity(): Promise<{ publicKey: string }> {
  const existing = identityRow()
  if (existing) return { publicKey: existing.publicKey }
  const { privateKey, publicKey } = generateAgentKeyPair()
  db.insert(agentIdentity)
    .values({ id: IDENTITY_ID, privateKey: encrypt(privateKey), publicKey })
    .run()
  return { publicKey }
}

export async function getAgentPublicKey(): Promise<string | null> {
  return identityRow()?.publicKey ?? null
}

/** Decrypted OpenSSH private key for ssh2 to authenticate with. Callers must not log it. */
export async function getAgentPrivateKey(): Promise<string | null> {
  const row = identityRow()
  return row ? decrypt(row.privateKey) : null
}

/** Rotate the identity; caller must re-add the new public key to each host's authorized_keys. */
export async function regenerateAgentIdentity(): Promise<{ publicKey: string }> {
  const { privateKey, publicKey } = generateAgentKeyPair()
  const values = { privateKey: encrypt(privateKey), publicKey, updatedAt: new Date() }
  if (identityRow()) {
    db.update(agentIdentity).set(values).where(eq(agentIdentity.id, IDENTITY_ID)).run()
  } else {
    db.insert(agentIdentity)
      .values({ id: IDENTITY_ID, ...values })
      .run()
  }
  return { publicKey }
}
