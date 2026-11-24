import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { echoes, glitches, guardians, operations } from '#/db/schema.ts'
import {
  DEFUSE_BASE_POINTS,
  MAX_STRIKES,
  publicPuzzle,
  STRIKE_PENALTY_SECONDS,
  type BombPuzzle,
  type PublicBombPuzzle,
} from '#/lib/bomb.ts'
import { siteName, type DistrictId } from '#/lib/districts.ts'
import { computeImpact } from '#/lib/operations.ts'
import { requireGuardian, requireReporter } from '#/lib/session.ts'
import { detonateExpiredBombs, executeDueOperations, nextId } from '#/lib/world.ts'

/**
 * Public view of a planted device. Keyed by its glitch id: the operation id
 * (and who planted it) stays hidden from everyone.
 */
export type ActiveBomb = {
  glitchId: string
  district: DistrictId
  siteId: string
  siteName: string
  /** ISO 8601 */
  armedAt: string
  /** ISO 8601. Moves earlier with every wrong cut. */
  fuseEndsAt: string
}

export type BombState = ActiveBomb & {
  status: 'ARMED' | 'DEFUSED' | 'DETONATED'
  puzzle: PublicBombPuzzle
  resolvedAt: string | null
  defusedByCodename: string | null
  defusePoints: number | null
  /** Set once it detonates. A defused device harms nobody (all 0). */
  casualties: number | null
  injured: number | null
  /** Metres. */
  blastRadius: number | null
}

/** A device that went off recently: shown briefly in the alert strip. */
export type RecentBlast = {
  glitchId: string
  district: DistrictId
  siteName: string
  /** ISO 8601 */
  detonatedAt: string
  casualties: number
  injured: number
  blastRadius: number
}

export type CutResult = {
  result: 'correct' | 'wrong' | 'defused' | 'detonated' | 'already-resolved'
  state: BombState
}

function loadBomb(glitchId: string) {
  return db
    .select({
      operationId: operations.operationId,
      glitchId: operations.glitchId,
      district: operations.district,
      siteId: operations.siteId,
      scheduledFor: operations.scheduledFor,
      fuseEndsAt: operations.fuseEndsAt,
      puzzle: operations.puzzle,
      outcome: operations.outcome,
      resolvedAt: operations.resolvedAt,
      defusePoints: operations.defusePoints,
      casualties: operations.casualties,
      injured: operations.injured,
      blastRadius: operations.blastRadius,
      defusedByCodename: guardians.codename,
    })
    .from(operations)
    .leftJoin(guardians, eq(operations.defusedBy, guardians.guardianId))
    .where(and(eq(operations.type, 'bomb'), eq(operations.status, 'EXECUTED'), eq(operations.glitchId, glitchId)))
    .get()
}

function toState(row: NonNullable<ReturnType<typeof loadBomb>>): BombState {
  return {
    glitchId: row.glitchId!,
    district: row.district,
    siteId: row.siteId,
    siteName: siteName(row.siteId) ?? row.siteId,
    armedAt: row.scheduledFor,
    fuseEndsAt: row.fuseEndsAt!,
    status: row.outcome ?? 'ARMED',
    puzzle: publicPuzzle(JSON.parse(row.puzzle!) as BombPuzzle),
    resolvedAt: row.resolvedAt,
    defusedByCodename: row.defusedByCodename,
    defusePoints: row.defusePoints,
    ...harmFor(row),
  }
}

/** Stored harm, or the seeded numbers for devices that went off before they were stored. */
function harmFor(row: { operationId: string; siteId: string; outcome: string | null; casualties: number | null; injured: number | null; blastRadius: number | null }) {
  if (row.outcome === 'DEFUSED') return { casualties: 0, injured: 0, blastRadius: 0 }
  if (row.outcome !== 'DETONATED') return { casualties: null, injured: null, blastRadius: null }
  if (row.casualties != null && row.injured != null && row.blastRadius != null) {
    return { casualties: row.casualties, injured: row.injured, blastRadius: row.blastRadius }
  }
  return computeImpact(row.operationId, 'bomb', row.siteId)
}

/** Every device currently ticking. Shown to all guardians as an alert. */
export const getActiveBombs = createServerFn({ method: 'GET' }).handler(async (): Promise<ActiveBomb[]> => {
  requireGuardian()
  executeDueOperations()
  return db
    .select({
      glitchId: operations.glitchId,
      district: operations.district,
      siteId: operations.siteId,
      armedAt: operations.scheduledFor,
      fuseEndsAt: operations.fuseEndsAt,
    })
    .from(operations)
    .where(and(eq(operations.type, 'bomb'), eq(operations.status, 'EXECUTED'), isNull(operations.outcome)))
    .all()
    .filter((r) => r.glitchId && r.fuseEndsAt)
    .map((r) => ({
      glitchId: r.glitchId!,
      district: r.district,
      siteId: r.siteId,
      siteName: siteName(r.siteId) ?? r.siteId,
      armedAt: r.armedAt,
      fuseEndsAt: r.fuseEndsAt!,
    }))
})

/** How long a detonation stays in the alert strip. */
const BLAST_NEWS_MS = 10 * 60_000

/** Devices that detonated in the last few minutes, newest first, with the damage done. */
export const getRecentBlasts = createServerFn({ method: 'GET' }).handler(async (): Promise<RecentBlast[]> => {
  requireGuardian()
  executeDueOperations()
  const since = new Date(Date.now() - BLAST_NEWS_MS).toISOString()
  return db
    .select({
      operationId: operations.operationId,
      glitchId: operations.glitchId,
      district: operations.district,
      siteId: operations.siteId,
      outcome: operations.outcome,
      resolvedAt: operations.resolvedAt,
      casualties: operations.casualties,
      injured: operations.injured,
      blastRadius: operations.blastRadius,
    })
    .from(operations)
    .where(and(eq(operations.type, 'bomb'), eq(operations.outcome, 'DETONATED'), gte(operations.resolvedAt, since)))
    .orderBy(desc(operations.resolvedAt))
    .all()
    .filter((r) => r.glitchId && r.resolvedAt)
    .map((r) => {
      const harm = harmFor(r)
      return {
        glitchId: r.glitchId!,
        district: r.district,
        siteName: siteName(r.siteId) ?? r.siteId,
        detonatedAt: r.resolvedAt!,
        casualties: harm.casualties ?? 0,
        injured: harm.injured ?? 0,
        blastRadius: harm.blastRadius ?? 0,
      }
    })
})

/** One device, armed or resolved, with its wires and manual (never the solution). Null if the glitch isn't a bomb. */
export const getBomb = createServerFn({ method: 'GET' })
  .validator((glitchId: string) => String(glitchId))
  .handler(async ({ data: glitchId }): Promise<BombState | null> => {
    requireGuardian()
    executeDueOperations()
    const row = loadBomb(glitchId)
    return row ? toState(row) : null
  })

/**
 * Cut one wire. The right wire advances the manual; the wrong one is a strike
 * that burns fuse. Three strikes, or a burnt-out fuse, and it goes off.
 * Cutting the last right wire defuses it and awards hero points.
 */
export const cutWire = createServerFn({ method: 'POST' })
  .validator((input: { glitchId: string; wire: number }) => {
    const wire = Number(input.wire)
    if (!Number.isInteger(wire) || wire < 0 || wire > 9) throw new Error('Pick a wire.')
    return { glitchId: String(input.glitchId), wire }
  })
  .handler(async ({ data }): Promise<CutResult> => {
    const guardian = requireReporter()
    const now = new Date()
    executeDueOperations(now)

    const row = loadBomb(data.glitchId)
    if (!row) throw new Error('There’s no device on this file.')
    if (row.outcome) return { result: 'already-resolved', state: toState(row) }

    const puzzle = JSON.parse(row.puzzle!) as BombPuzzle
    if (data.wire >= puzzle.wires.length || puzzle.cut.includes(data.wire)) {
      throw new Error('That wire is already cut, or doesn’t exist.')
    }

    const expected = puzzle.solution[puzzle.cut.length]
    if (data.wire !== expected) {
      puzzle.strikes += 1
      const newFuse = new Date(new Date(row.fuseEndsAt!).getTime() - STRIKE_PENALTY_SECONDS * 1000)
      const blown = puzzle.strikes >= MAX_STRIKES || newFuse <= now
      db.update(operations)
        .set({ puzzle: JSON.stringify(puzzle), fuseEndsAt: (blown ? now : newFuse).toISOString() })
        .where(eq(operations.operationId, row.operationId))
        .run()
      if (blown) {
        detonateExpiredBombs(now)
        return { result: 'detonated', state: toState(loadBomb(data.glitchId)!) }
      }
      return { result: 'wrong', state: toState(loadBomb(data.glitchId)!) }
    }

    puzzle.cut.push(data.wire)
    if (puzzle.cut.length < puzzle.solution.length) {
      db.update(operations).set({ puzzle: JSON.stringify(puzzle) }).where(eq(operations.operationId, row.operationId)).run()
      return { result: 'correct', state: toState(loadBomb(data.glitchId)!) }
    }

    // Defused.
    const secondsLeft = Math.max(0, Math.round((new Date(row.fuseEndsAt!).getTime() - now.getTime()) / 1000))
    const points = DEFUSE_BASE_POINTS + secondsLeft
    db.transaction((tx) => {
      tx.update(operations)
        .set({
          puzzle: JSON.stringify(puzzle),
          outcome: 'DEFUSED',
          resolvedAt: now.toISOString(),
          defusedBy: guardian.guardianId,
          defusePoints: points,
          casualties: 0,
          injured: 0,
          blastRadius: 0,
        })
        .where(eq(operations.operationId, row.operationId))
        .run()
      tx.update(glitches).set({ status: 'FIXED' }).where(eq(glitches.glitchId, data.glitchId)).run()
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
      tx.insert(echoes)
        .values({
          echoId: nextId('EC', echoIds),
          glitchId: data.glitchId,
          description: `Device at ${siteName(row.siteId) ?? 'the site'} defused with ${secondsLeft} seconds to spare.`,
          timestamp: now.toISOString(),
          reportingGuardianId: guardian.guardianId,
        })
        .run()
    })
    return { result: 'defused', state: toState(loadBomb(data.glitchId)!) }
  })
