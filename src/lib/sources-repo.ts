import { eq } from 'drizzle-orm'
import { db } from '../db'
import { sources } from '../db/schema'
import type { AuthConfig, Source } from './config'
import { decryptNullable, encryptNullable } from './encryption'
import { invalidateMergedSpecCache } from './spec-cache'
import { withInferredApiBasePath } from './source-spec'
import { getTemplate } from './templates'

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:'])

function validateHttpUrl(value: string, label: string): void {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} must be a valid URL`)
  }
  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new Error(`${label} must use http or https (got "${parsed.protocol}")`)
  }
}

function validateSource(source: Source): void {
  if (!source.kind) {
    throw new Error('source.kind is required')
  }
  if (source.kind === 'custom') {
    if (!source.specUrl) {
      throw new Error('Custom sources require specUrl')
    }
  } else {
    const template = getTemplate(source.kind)
    if (!template) {
      throw new Error(`Unknown template kind: ${source.kind}`)
    }
  }
  validateHttpUrl(source.baseUrl, 'baseUrl')
  if (source.specUrl) validateHttpUrl(source.specUrl, 'specUrl')
  if (source.fallbackSpecUrl) validateHttpUrl(source.fallbackSpecUrl, 'fallbackSpecUrl')
}

type Row = typeof sources.$inferSelect
type Insert = typeof sources.$inferInsert

function rowToSource(row: Row): Source {
  return {
    slug: row.slug,
    kind: row.kind,
    baseUrl: row.baseUrl,
    apiBasePath: row.apiBasePath ?? undefined,
    specVersion: row.specVersion ?? undefined,
    specUrl: row.specUrl ?? undefined,
    fallbackSpecUrl: row.fallbackSpecUrl ?? undefined,
    allowInvalidTls: row.allowInvalidTls,
    auth: rowToAuth(row),
  }
}

function rowToAuth(row: Row): AuthConfig {
  switch (row.authType) {
    case 'bearer':
      return { type: 'bearer', token: decryptNullable(row.authToken) ?? undefined }
    case 'header':
      return {
        type: 'header',
        name: row.authHeaderName ?? undefined,
        value: decryptNullable(row.authHeaderValue) ?? undefined,
      }
    case 'none':
      return { type: 'none' }
  }
}

function sourceToInsert(s: Source): Insert {
  const isCustom = s.kind === 'custom'
  return {
    slug: s.slug,
    kind: s.kind,
    baseUrl: s.baseUrl,
    apiBasePath: s.apiBasePath ?? null,
    specVersion: isCustom ? null : (s.specVersion ?? null),
    specUrl: isCustom ? (s.specUrl ?? null) : null,
    fallbackSpecUrl: isCustom ? (s.fallbackSpecUrl ?? null) : null,
    allowInvalidTls: s.allowInvalidTls ?? false,
    authType: s.auth.type,
    authToken: s.auth.type === 'bearer' ? encryptNullable(s.auth.token ?? null) : null,
    authHeaderName: s.auth.type === 'header' ? (s.auth.name ?? null) : null,
    authHeaderValue: s.auth.type === 'header' ? encryptNullable(s.auth.value ?? null) : null,
  }
}

export async function getSources(): Promise<Source[]> {
  const rows = db.select().from(sources).all()
  return rows.map(rowToSource)
}

export async function getSource(slug: string): Promise<Source | null> {
  const row = db.select().from(sources).where(eq(sources.slug, slug)).get()
  return row ? rowToSource(row) : null
}

export async function addSource(source: Source): Promise<Source> {
  validateSource(source)
  const enriched = await withInferredApiBasePath(source)
  db.insert(sources).values(sourceToInsert(enriched)).run()
  invalidateMergedSpecCache()
  return enriched
}

export async function updateSource(slug: string, source: Source): Promise<Source> {
  validateSource({ ...source, slug })
  const enriched = await withInferredApiBasePath({ ...source, slug })
  const { slug: _omit, ...rest } = sourceToInsert(enriched)
  db.update(sources)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(sources.slug, slug))
    .run()
  invalidateMergedSpecCache()
  return enriched
}

export async function deleteSource(slug: string): Promise<void> {
  db.delete(sources).where(eq(sources.slug, slug)).run()
  invalidateMergedSpecCache()
}

export async function sourceExists(slug: string): Promise<boolean> {
  const row = db.select({ slug: sources.slug }).from(sources).where(eq(sources.slug, slug)).get()
  return Boolean(row)
}
