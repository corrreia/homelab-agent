import { relations, sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const oauthApplication = sqliteTable(
  'oauth_application',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    icon: text('icon'),
    metadata: text('metadata'),
    clientId: text('client_id').unique(),
    clientSecret: text('client_secret'),
    redirectUrls: text('redirect_urls'),
    type: text('type'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('oauthApplication_userId_idx').on(table.userId)],
)

export const oauthAccessToken = sqliteTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    accessToken: text('access_token').unique(),
    refreshToken: text('refresh_token').unique(),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    clientId: text('client_id').references(() => oauthApplication.clientId, {
      onDelete: 'cascade',
    }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    scopes: text('scopes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_userId_idx').on(table.userId),
  ],
)

export const oauthConsent = sqliteTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').references(() => oauthApplication.clientId, {
      onDelete: 'cascade',
    }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    scopes: text('scopes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    consentGiven: integer('consent_given', { mode: 'boolean' }),
  },
  (table) => [index('oauthConsent_clientId_idx').on(table.clientId), index('oauthConsent_userId_idx').on(table.userId)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  oauthApplications: many(oauthApplication),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const oauthApplicationRelations = relations(oauthApplication, ({ one, many }) => ({
  user: one(user, {
    fields: [oauthApplication.userId],
    references: [user.id],
  }),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}))

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
  oauthApplication: one(oauthApplication, {
    fields: [oauthAccessToken.clientId],
    references: [oauthApplication.clientId],
  }),
  user: one(user, {
    fields: [oauthAccessToken.userId],
    references: [user.id],
  }),
}))

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthApplication: one(oauthApplication, {
    fields: [oauthConsent.clientId],
    references: [oauthApplication.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}))

export const sources = sqliteTable('sources', {
  slug: text('slug').primaryKey(),
  /** Either a known template id (e.g. 'jellyfin') or 'custom' */
  kind: text('kind').notNull().default('custom'),
  /** Optional: the SSH host this service runs on. */
  hostSlug: text('host_slug').references((): AnySQLiteColumn => hosts.slug, { onDelete: 'set null' }),
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

/**
 * SSH hosts the agent can reach. They all authenticate with the shared agent identity key.
 * `hostKey` is the server's public host key, pinned trust-on-first-use for MITM protection —
 * it belongs to the host it identifies, not to a global blob.
 */
export const hosts = sqliteTable('hosts', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  hostname: text('hostname').notNull(),
  port: integer('port').notNull().default(22),
  username: text('username').notNull(),
  hostKey: text('host_key'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/**
 * Singleton (id = 'default') holding the agent's SSH identity. `privateKey` is stored with
 * the same AES-GCM envelope as source creds (see src/lib/encryption.ts) and must never be
 * logged or returned by any endpoint.
 */
export const agentIdentity = sqliteTable('agent_identity', {
  id: text('id').primaryKey(),
  privateKey: text('private_key').notNull(),
  publicKey: text('public_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** A source (service) optionally runs on a host — the core homelab relation. */
export const hostsRelations = relations(hosts, ({ many }) => ({
  sources: many(sources),
}))

export const sourcesRelations = relations(sources, ({ one }) => ({
  host: one(hosts, {
    fields: [sources.hostSlug],
    references: [hosts.slug],
  }),
}))
