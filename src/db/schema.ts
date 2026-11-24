import { blob, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
// Relative import: drizzle-kit loads this file and doesn't resolve the `#/` alias.
import { GLITCH_STATUSES, GUARDIAN_ROLES } from '../lib/glitch.ts'
import { DISTRICT_IDS } from '../lib/districts.ts'
import { OPERATION_STATUSES, OPERATION_TYPES } from '../lib/operations.ts'
import { BOMB_OUTCOMES } from '../lib/bomb.ts'

export const glitches = sqliteTable('glitches', {
  glitchId: text('glitch_id').primaryKey(),
  status: text('status', { enum: GLITCH_STATUSES }).notNull(),
  district: text('district', { enum: DISTRICT_IDS }).notNull(),
  /** Optional landmark, e.g. "clockworks:station". */
  siteId: text('site_id'),
  description: text('description').notNull(),
  /** ISO 8601, so lexical order is chronological order. */
  timestamp: text('timestamp').notNull(),
  // --- AI layer (all optional; humans can set them too) ---
  /** Classifier output, e.g. "temporal". Mapping to icon/colour lives in config. */
  type: text('type'),
  /** 1 (minor) to 5 (critical). */
  severity: integer('severity'),
  /** Defender this glitch is assigned to. */
  assignedTo: text('assigned_to').references(() => guardians.guardianId),
  /**
   * JSON: fields a human locked, e.g. {"type":true,"assignment":true,"status":true,"link":true}.
   * The AI must never write a locked field.
   */
  overrides: text('overrides'),
  /** JSON: per-field AI notes, e.g. {"type":{"confidence":0.7,"needsReview":true,"by":"classifier"}}. */
  aiReview: text('ai_review'),
  /** JSON: generated runbook (steps). */
  runbook: text('runbook'),
})

export const guardians = sqliteTable('guardians', {
  guardianId: text('guardian_id').primaryKey(),
  codename: text('codename').notNull().unique(),
  role: text('role', { enum: GUARDIAN_ROLES }).notNull(),
  /** scrypt, see src/lib/password.ts */
  passwordHash: text('password_hash').notNull(),
})

export const echoes = sqliteTable('echoes', {
  echoId: text('echo_id').primaryKey(),
  glitchId: text('glitch_id')
    .notNull()
    .references(() => glitches.glitchId, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  /** ISO 8601 */
  timestamp: text('timestamp').notNull(),
  reportingGuardianId: text('reporting_guardian_id')
    .notNull()
    .references(() => guardians.guardianId),
  /** Moderation: OK (default), REVIEW (held for an admin) or BLOCKED (hidden). */
  moderation: text('moderation', { enum: ['OK', 'REVIEW', 'BLOCKED'] }).notNull().default('OK'),
  /** Short reason code only. Never copy illegal content here. */
  moderationReason: text('moderation_reason'),
})

export const echoImages = sqliteTable('echo_images', {
  imageId: text('image_id').primaryKey(),
  echoId: text('echo_id')
    .notNull()
    .references(() => echoes.echoId, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type', { enum: ['image/jpeg', 'image/png', 'image/webp'] }).notNull(),
  byteSize: integer('byte_size').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  createdAt: text('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  guardianId: text('guardian_id')
    .notNull()
    .references(() => guardians.guardianId, { onDelete: 'cascade' }),
  /** ISO 8601 */
  expiresAt: text('expires_at').notNull(),
})

export const notificationPreferences = sqliteTable('notification_preferences', {
  guardianId: text('guardian_id')
    .primaryKey()
    .references(() => guardians.guardianId, { onDelete: 'cascade' }),
  inApp: integer('in_app', { mode: 'boolean' }).notNull().default(true),
  push: integer('push', { mode: 'boolean' }).notNull().default(false),
  email: integer('email', { mode: 'boolean' }).notNull().default(false),
  sms: integer('sms', { mode: 'boolean' }).notNull().default(false),
  emailAddress: text('email_address'),
  phoneNumber: text('phone_number'),
  updatedAt: text('updated_at').notNull(),
})

export const notifications = sqliteTable(
  'notifications',
  {
    notificationId: text('notification_id').primaryKey(),
    guardianId: text('guardian_id')
      .notNull()
      .references(() => guardians.guardianId, { onDelete: 'cascade' }),
    eventKey: text('event_key').notNull(),
    kind: text('kind', { enum: ['CRITICAL_REPORT', 'BOMB_ARMED', 'BOMB_DETONATED'] }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    href: text('href').notNull(),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (table) => [uniqueIndex('notifications_guardian_event_unique').on(table.guardianId, table.eventKey)],
)

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    subscriptionId: text('subscription_id').primaryKey(),
    guardianId: text('guardian_id')
      .notNull()
      .references(() => guardians.guardianId, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint)],
)

/** False flag operations planned by commanders. Never exposed to defenders. */
export const operations = sqliteTable('operations', {
  operationId: text('operation_id').primaryKey(),
  district: text('district', { enum: DISTRICT_IDS }).notNull(),
  siteId: text('site_id').notNull(),
  type: text('type', { enum: OPERATION_TYPES }).notNull(),
  coverStory: text('cover_story').notNull(),
  /** ISO 8601. When it goes off. */
  scheduledFor: text('scheduled_for').notNull(),
  createdAt: text('created_at').notNull(),
  plannerId: text('planner_id')
    .notNull()
    .references(() => guardians.guardianId),
  status: text('status', { enum: OPERATION_STATUSES }).notNull(),
  /** The staged glitch it produced once executed. */
  glitchId: text('glitch_id').references(() => glitches.glitchId, { onDelete: 'set null' }),
  // Bombs only.
  /** ISO 8601. When the device goes off unless defused. */
  fuseEndsAt: text('fuse_ends_at'),
  /** BombPuzzle as JSON. Holds the solution: never send it to clients. */
  puzzle: text('puzzle'),
  outcome: text('outcome', { enum: BOMB_OUTCOMES }),
  /** ISO 8601. When it was defused or detonated. */
  resolvedAt: text('resolved_at'),
  defusedBy: text('defused_by').references(() => guardians.guardianId),
  /** Hero points awarded for the defusal. */
  defusePoints: integer('defuse_points'),
  /** Physical impact of an attack, for the map and the history. */
  casualties: integer('casualties'),
  injured: integer('injured'),
  /** Metres, on the city plan scale. */
  blastRadius: integer('blast_radius'),
  /** Person of interest the attack is pinned on (framed). */
  pinnedOn: text('pinned_on').references(() => persons.personId),
})

/**
 * People of interest: Desync members and sympathisers. The static profile
 * (name, role, bio) lives in code (src/lib/persons.ts); this table holds the
 * state the game changes.
 */
export const persons = sqliteTable('persons', {
  personId: text('person_id').primaryKey(),
  /** AT_LARGE | WANTED | DETAINED | ERASED */
  status: text('status').notNull(),
  /** 0–100: how hard the agency is hunting them. */
  heat: integer('heat').notNull().default(0),
  /** ISO 8601 */
  updatedAt: text('updated_at').notNull(),
})

/** Entries in a person's case file: intercepts, sightings, attributions, agency notes. */
export const caseEntries = sqliteTable('case_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personId: text('person_id')
    .notNull()
    .references(() => persons.personId, { onDelete: 'cascade' }),
  /** INTERCEPT | SIGHTING | ATTRIBUTION | NOTE | ACTION | LEAK */
  kind: text('kind').notNull(),
  /** In-world text. CLASSIFIED entries are only shown to commanders/admins. */
  body: text('body').notNull(),
  classified: integer('classified', { mode: 'boolean' }).notNull().default(false),
  /** Optional links. */
  glitchId: text('glitch_id').references(() => glitches.glitchId, { onDelete: 'set null' }),
  operationId: text('operation_id'),
  authorId: text('author_id').references(() => guardians.guardianId),
  /** ISO 8601 */
  timestamp: text('timestamp').notNull(),
})

/** Append-only log of every AI (and policy) decision. */
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  traceId: text('trace_id').notNull(),
  /** Agent or component, e.g. "classifier", "policy", "mcp". */
  agent: text('agent').notNull(),
  /** JSON array of input ids (echo, glitch, sensor ids). Ids only, never content. */
  inputIds: text('input_ids').notNull(),
  /** Short decision summary, e.g. "type=temporal". */
  decision: text('decision').notNull(),
  confidence: real('confidence'),
  /** executed | labelled | escalated | blocked | failed */
  outcome: text('outcome').notNull(),
  /** ISO 8601 */
  timestamp: text('timestamp').notNull(),
})

/** IoT sensor readings per district (simulated in dev/demo). */
export const sensorReadings = sqliteTable('sensor_readings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sensorId: text('sensor_id').notNull(),
  district: text('district', { enum: DISTRICT_IDS }).notNull(),
  /** e.g. "magic_reserve", "data_stock", "clock_drift" */
  metric: text('metric').notNull(),
  value: real('value').notNull(),
  /** ISO 8601 */
  timestamp: text('timestamp').notNull(),
})

/** Personal access tokens for MCP clients. Only a hash is stored. */
export const apiTokens = sqliteTable('api_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  guardianId: text('guardian_id')
    .notNull()
    .references(() => guardians.guardianId, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  /** ISO 8601 */
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
})
