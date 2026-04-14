import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { invalidateMergedSpecCache } from './spec-cache'

export interface AuthConfig {
  type: 'bearer' | 'header' | 'none'
  token?: string
  name?: string
  value?: string
}

export interface Source {
  slug: string
  /** Only set for custom (non-template) sources */
  specUrl?: string
  /** Only set for custom (non-template) sources */
  fallbackSpecUrl?: string
  /** Selected version for templates with multiple API versions (e.g. UniFi) */
  specVersion?: string
  baseUrl: string
  apiBasePath?: string
  allowInvalidTls?: boolean
  auth: AuthConfig
}

export interface ServerConfig {
  port: number
  mcpPath: string
}

export interface Config {
  sources: Source[]
  server: ServerConfig
}

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json')

const DEFAULT_CONFIG: Config = {
  sources: [],
  server: { port: 3000, mcpPath: '/api/mcp' },
}

export async function readConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_CONFIG
    }
    throw err
  }
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
  invalidateMergedSpecCache()
}
