import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sources = sqliteTable('sources', {
  slug: text('slug').primaryKey(),
  baseUrl: text('base_url').notNull(),
  apiBasePath: text('api_base_path'),
  specVersion: text('spec_version'),
  specUrl: text('spec_url'),
  fallbackSpecUrl: text('fallback_spec_url'),
  allowInvalidTls: integer('allow_invalid_tls', { mode: 'boolean' }).notNull().default(false),
  authType: text('auth_type', { enum: ['bearer', 'header', 'none'] }).notNull(),
  authToken: text('auth_token'),
  authHeaderName: text('auth_header_name'),
  authHeaderValue: text('auth_header_value'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})
