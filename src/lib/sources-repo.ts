import { eq } from 'drizzle-orm'
import { db } from '../db'
import { sources } from '../db/schema'
import type { AuthConfig, Source } from './config'
import { invalidateMergedSpecCache } from './spec-cache'
import { withInferredApiBasePath } from './source-spec'

type Row = typeof sources.$inferSelect
type Insert = typeof sources.$inferInsert

function rowToSource(row: Row): Source {
  return {
    slug: row.slug,
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
      return { type: 'bearer', token: row.authToken ?? undefined }
    case 'header':
      return { type: 'header', name: row.authHeaderName ?? undefined, value: row.authHeaderValue ?? undefined }
    case 'none':
      return { type: 'none' }
  }
}

function sourceToInsert(s: Source): Insert {
  return {
    slug: s.slug,
    baseUrl: s.baseUrl,
    apiBasePath: s.apiBasePath ?? null,
    specVersion: s.specVersion ?? null,
    specUrl: s.specUrl ?? null,
    fallbackSpecUrl: s.fallbackSpecUrl ?? null,
    allowInvalidTls: s.allowInvalidTls ?? false,
    authType: s.auth.type,
    authToken: s.auth.type === 'bearer' ? (s.auth.token ?? null) : null,
    authHeaderName: s.auth.type === 'header' ? (s.auth.name ?? null) : null,
    authHeaderValue: s.auth.type === 'header' ? (s.auth.value ?? null) : null,
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
  const enriched = await withInferredApiBasePath(source)
  db.insert(sources).values(sourceToInsert(enriched)).run()
  invalidateMergedSpecCache()
  return enriched
}

export async function updateSource(slug: string, source: Source): Promise<Source> {
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
