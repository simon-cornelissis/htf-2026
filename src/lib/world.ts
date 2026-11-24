// Server-only: called from inside server function handlers.
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { echoes, glitches, guardians, operations } from '#/db/schema.ts'
import { FUSE_SECONDS, generatePuzzle } from '#/lib/bomb.ts'
import { siteName, type DistrictId } from '#/lib/districts.ts'
import { computeImpact, computeMoods, IMPACT, type DistrictMood } from '#/lib/operations.ts'

/** Next id like GL-0143, from the highest existing number. */
export function nextId(prefix: 'GL' | 'EC' | 'OP', ids: string[]): string {
  const highest = ids.reduce((top, id) => {
    const n = Number(id.split('-')[1])
    return Number.isFinite(n) && n > top ? n : top
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}

/**
 * Anonymous civilian tip line. Staged reports arrive through it so defenders
 * can't trace them back to a commander. It has no password and can't sign in.
 */
export const RELAY_GUARDIAN = { guardianId: 'GD-000', codename: 'CIVILIAN RELAY', role: 'defender' as const, passwordHash: '!' }

function ensureRelay() {
  db.insert(guardians).values(RELAY_GUARDIAN).onConflictDoNothing().run()
}

/**
 * Fire every planned operation whose time has come: it becomes a LEAKED
 * glitch with the cover story as its first echo, sent in through the civilian relay.
 * Runs lazily on every read, so no background job is needed.
 */
export function executeDueOperations(now = new Date()) {
  detonateExpiredBombs(now)
  const due = db
    .select()
    .from(operations)
    .where(and(eq(operations.status, 'PLANNED'), lte(operations.scheduledFor, now.toISOString())))
    .all()
  if (due.length === 0) return
  ensureRelay()

  db.transaction((tx) => {
    for (const op of due) {
      const glitchIds = tx.select({ id: glitches.glitchId }).from(glitches).all().map((r) => r.id)
      const glitchId = nextId('GL', glitchIds)
      tx.insert(glitches)
        .values({
          glitchId,
          status: 'LEAKED',
          district: op.district,
          siteId: op.siteId,
          description: op.coverStory,
          timestamp: op.scheduledFor,
        })
        .run()
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
      tx.insert(echoes)
        .values({
          echoId: nextId('EC', echoIds),
          glitchId,
          description: op.coverStory,
          timestamp: op.scheduledFor,
          reportingGuardianId: RELAY_GUARDIAN.guardianId,
        })
        .run()
      if (op.type === 'bomb') {
        const bomb = {
          fuseEndsAt: new Date(new Date(op.scheduledFor).getTime() + FUSE_SECONDS * 1000).toISOString(),
          puzzle: JSON.stringify(generatePuzzle(Number(op.operationId.replace(/\D/g, '')) * 7919 + (Date.now() % 100000))),
        }
        tx.update(operations).set({ status: 'EXECUTED', glitchId, ...bomb }).where(eq(operations.operationId, op.operationId)).run()
        continue
      }
      // Everything else does its harm the moment it goes off.
      const harm = computeImpact(op.operationId, op.type, op.siteId)
      if (harm.casualties + harm.injured > 0) {
        const counted = IMPACT[op.type].countWord === 'missing' ? `${harm.casualties} missing` : `${harm.casualties} dead, ${harm.injured} injured`
        const ids = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
        const at = Math.min(now.getTime(), new Date(op.scheduledFor).getTime() + 60_000)
        tx.insert(echoes)
          .values({
            echoId: nextId('EC', ids),
            glitchId,
            description: `First count from the scene: ${counted}. Area affected out to ${harm.blastRadius} m.`,
            timestamp: new Date(at).toISOString(),
            reportingGuardianId: RELAY_GUARDIAN.guardianId,
          })
          .run()
      }
      tx.update(operations).set({ status: 'EXECUTED', glitchId, ...harm }).where(eq(operations.operationId, op.operationId)).run()
    }
  })
}

/**
 * Armed devices whose fuse ran out go off: the bomb is marked DETONATED and
 * the civilian relay reports it on the glitch's log.
 */
export function detonateExpiredBombs(now = new Date()) {
  const expired = db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.type, 'bomb'),
        eq(operations.status, 'EXECUTED'),
        isNull(operations.outcome),
        lte(operations.fuseEndsAt, now.toISOString()),
      ),
    )
    .all()
  if (expired.length === 0) return
  ensureRelay()
  db.transaction((tx) => {
    for (const op of expired) {
      const impact = computeImpact(op.operationId, 'bomb', op.siteId)
      tx.update(operations)
        .set({ outcome: 'DETONATED', resolvedAt: op.fuseEndsAt, ...impact })
        .where(eq(operations.operationId, op.operationId))
        .run()
      if (!op.glitchId) continue
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
      tx.insert(echoes)
        .values({
          echoId: nextId('EC', echoIds),
          glitchId: op.glitchId,
          description: `The device at ${siteName(op.siteId) ?? 'the site'} detonated. Nobody reached it in time. ${impact.casualties} dead, ${impact.injured} injured, damage out to ${impact.blastRadius} m.`,
          timestamp: op.fuseEndsAt!,
          reportingGuardianId: RELAY_GUARDIAN.guardianId,
        })
        .run()
    }
  })
}

/** Glitch id -> operation id, for glitches that were staged. Commanders only. */
export function stagedGlitches(): Map<string, string> {
  const rows = db
    .select({ glitchId: operations.glitchId, operationId: operations.operationId })
    .from(operations)
    .where(isNotNull(operations.glitchId))
    .all()
  return new Map(rows.map((r) => [r.glitchId!, r.operationId]))
}

export function loadMoods(revealOperations: boolean): Record<DistrictId, DistrictMood> {
  const g = db
    .select({ glitchId: glitches.glitchId, district: glitches.district, status: glitches.status })
    .from(glitches)
    .all()
  const ops = db
    .select({
      operationId: operations.operationId,
      district: operations.district,
      siteId: operations.siteId,
      type: operations.type,
      scheduledFor: operations.scheduledFor,
      outcome: operations.outcome,
      resolvedAt: operations.resolvedAt,
      casualties: operations.casualties,
      injured: operations.injured,
    })
    .from(operations)
    .where(eq(operations.status, 'EXECUTED'))
    .all()
  return computeMoods(g, ops, revealOperations)
}
