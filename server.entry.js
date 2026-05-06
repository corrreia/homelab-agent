try {
  process.loadEnvFile()
} catch {
  // No .env file — rely on real env vars.
}

import { serve } from 'srvx'
import { readFile, mkdir } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const DB_PATH = join(process.cwd(), 'data', 'app.db')
const MIGRATIONS_PATH = join(process.cwd(), 'migrations')

await mkdir(dirname(DB_PATH), { recursive: true })
const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH })
sqlite.close()
console.log('[db] migrations applied')

const { default: server } = await import('./dist/server/server.js')

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
    if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.svg') {
      const res = await handleStatic(url.pathname)
      if (res) return res
    }

    // RFC 9728 / RFC 8414 well-known endpoints live under Better Auth's
    // basePath; rewrite the top-level path to the /api/auth/ prefix.
    if (url.pathname.startsWith('/.well-known/')) {
      const rewritten = new URL(request.url)
      rewritten.pathname = '/api/auth' + url.pathname
      return server.fetch(new Request(rewritten, request))
    }

    // Fall through to SSR handler
    return server.fetch(request)
  },
})

await srv.ready()
console.log(`[server] listening on http://localhost:${process.env.PORT || 3000}`)
