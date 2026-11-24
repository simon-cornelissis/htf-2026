import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  guardianId: text('guardian_id')
    .notNull()
    .references(() => guardians.guardianId, { onDelete: 'cascade' }),
  /** ISO 8601 */
  expiresAt: text('expires_at').notNull(),
})

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
