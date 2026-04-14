// TODO: early-dev — disables TLS verification on every outbound fetch.
// Remove before any non-dev use and gate on per-source `allowInvalidTls`.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

import { serve } from 'srvx'
import { readFile, mkdir } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import server from './dist/server/server.js'

const DB_PATH = join(process.cwd(), 'data', 'app.db')
const MIGRATIONS_PATH = join(process.cwd(), 'data', 'migrations')

await mkdir(dirname(DB_PATH), { recursive: true })
const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH })
sqlite.close()
console.log('[db] migrations applied')

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const clientDir = join(__dirname, 'dist', 'client')

const mimeTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

async function handleStatic(pathname) {
  try {
    const filePath = join(clientDir, pathname)
    // Prevent directory traversal
    if (!filePath.startsWith(clientDir)) return null
    const content = await readFile(filePath)
    const ext = extname(filePath)
    return new Response(content, {
      headers: {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return null
  }
}

const srv = serve({
  port: Number(process.env.PORT || 3000),
  async fetch(request) {
    const url = new URL(request.url)

    // Serve static assets from dist/client/
    if (url.pathname.startsWith('/assets/')) {
      const res = await handleStatic(url.pathname)
      if (res) return res
    }

    // Fall through to SSR handler
    return server.fetch(request)
  },
})

await srv.ready()
console.log(`[server] listening on http://localhost:${process.env.PORT || 3000}`)
