import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// Relative import: drizzle-kit loads this file and doesn't resolve the `#/` alias.
import { GLITCH_STATUSES, GUARDIAN_ROLES } from '../lib/glitch.ts'
import { DISTRICT_IDS } from '../lib/districts.ts'
import { OPERATION_STATUSES, OPERATION_TYPES } from '../lib/operations.ts'

export const glitches = sqliteTable('glitches', {
  glitchId: text('glitch_id').primaryKey(),
  status: text('status', { enum: GLITCH_STATUSES }).notNull(),
  district: text('district', { enum: DISTRICT_IDS }).notNull(),
  /** Optional landmark, e.g. "clockworks:station". */
  siteId: text('site_id'),
  description: text('description').notNull(),
  /** ISO 8601, so lexical order is chronological order. */
  timestamp: text('timestamp').notNull(),
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
})
