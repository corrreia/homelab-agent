import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SPECS_DIR = join(process.cwd(), 'specs')

const cache = new Map<string, Record<string, unknown>>()

export function loadBundledSpec(relPath: string): Record<string, unknown> {
  const cached = cache.get(relPath)
  if (cached) return cached
  const text = readFileSync(join(SPECS_DIR, relPath), 'utf-8')
  const spec = JSON.parse(text) as Record<string, unknown>
  cache.set(relPath, spec)
  return spec
}
