import { eq } from 'drizzle-orm'
import { db } from '../db'
import { agentIdentity, hosts, knownHosts, sources } from '../db/schema'
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
  /** Whether this host's endpoint has a pinned server key (TOFU); false until the first successful connect. */
  pinned: boolean
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

/** The key under which a host's server key is pinned. */
export function endpointOf(host: Pick<Host, 'hostname' | 'port'>): string {
  return `${host.hostname}:${host.port}`
}

// ---- Hosts -----------------------------------------------------------------

export async function listHosts(): Promise<Host[]> {
  const pinned = new Set(
    db
      .select({ endpoint: knownHosts.endpoint })
      .from(knownHosts)
      .all()
      .map((r) => r.endpoint),
  )

  return db
    .select()
    .from(hosts)
    .all()
    .map((row) => toHost(row, pinned.has(endpointOf(row))))
}

export async function getHost(slug: string): Promise<Host | null> {
  const row = db.select().from(hosts).where(eq(hosts.slug, slug)).get()

  return row ? toHost(row, (await getPinnedHostKey(endpointOf(row))) !== null) : null
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

  return toHost(row, (await getPinnedHostKey(endpointOf(row))) !== null)
}

/** Remove a host row. Its endpoint's pinned key is deliberately kept — see `knownHosts`. */
export async function deleteHost(slug: string): Promise<void> {
  // Keep the relation consistent: sources that ran on this host lose the link.
  db.update(sources).set({ hostSlug: null }).where(eq(sources.hostSlug, slug)).run()
  db.delete(hosts).where(eq(hosts.slug, slug)).run()
}

function toHost(row: Omit<typeof hosts.$inferSelect, 'createdAt' | 'updatedAt'>, pinned: boolean): Host {
  return {
    slug: row.slug,
    label: row.label,
    hostname: row.hostname,
    port: row.port,
    username: row.username,
    pinned,
  }
}

// ---- Pinned server keys (trust-on-first-use) --------------------------------

export async function getPinnedHostKey(endpoint: string): Promise<string | null> {
  return db.select().from(knownHosts).where(eq(knownHosts.endpoint, endpoint)).get()?.hostKey ?? null
}

/** Pin an endpoint's server key on first connect. */
export async function pinHostKey(endpoint: string, hostKey: string): Promise<void> {
  db.insert(knownHosts)
    .values({ endpoint, hostKey })
    .onConflictDoUpdate({ target: knownHosts.endpoint, set: { hostKey } })
    .run()
}

/** Human-only (UI): drop a pin after a host was legitimately rebuilt; the next connect re-pins. */
export async function forgetHostKey(endpoint: string): Promise<void> {
  db.delete(knownHosts).where(eq(knownHosts.endpoint, endpoint)).run()
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
