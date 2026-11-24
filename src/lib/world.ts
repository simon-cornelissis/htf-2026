// Server-only: called from inside server function handlers.
import { and, desc, eq, isNotNull, isNull, lte, min, ne, sql } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { caseEntries, echoes, glitches, guardians, operations, persons } from '#/db/schema.ts'
import { FUSE_SECONDS, generatePuzzle } from '#/lib/bomb.ts'
import { siteName, type DistrictId } from '#/lib/districts.ts'
import { computeImpact, computeMoods, IMPACT, type DistrictMood } from '#/lib/operations.ts'
import {
  ATTRIBUTION_HEAT,
  computeExposure,
  isFree,
  isPersonStatus,
  LEAKS,
  PERSONS,
  personById,
  WANTED_HEAT,
  type CaseKind,
  type PersonStatus,
} from '#/lib/persons.ts'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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

export function ensureRelay() {
  db.insert(guardians).values(RELAY_GUARDIAN).onConflictDoNothing().run()
}

/**
 * Advance the world: settle bombs, fire due operations, keep the persons of
 * interest and the exposure meter up to date. Runs lazily on every read, so
 * no background job is needed.
 */
export function executeDueOperations(now = new Date()) {
  ensurePersons(now)
  detonateExpiredBombs(now)
  fireDueOperations(now)
  syncExposure(now)
}

/**
 * Fire every planned operation whose time has come: it becomes a LEAKED
 * glitch with the cover story as its first echo, sent in through the civilian relay.
 * If it was pinned on a person of interest, the attribution goes into their file.
 */
function fireDueOperations(now: Date) {
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
      if (op.pinnedOn) {
        const planner = tx.select({ codename: guardians.codename }).from(guardians).where(eq(guardians.guardianId, op.plannerId)).get()
        const harm = op.type === 'bomb' ? { casualties: 0, injured: 0 } : computeImpact(op.operationId, op.type, op.siteId)
        attributeIncident(tx, {
          personId: op.pinnedOn,
          glitchId,
          siteId: op.siteId,
          what: op.type === 'bomb' ? 'device was found' : IMPACT[op.type].label.toLowerCase(),
          at: op.scheduledFor,
          now,
          harm: harm.casualties * 2 + harm.injured,
          classifiedNote: `Attribution manufactured under ${op.operationId}, planned by ${planner?.codename ?? 'a commander'}. Witness statements prepared. Do not circulate.`,
          operationId: op.operationId,
        })
      }
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

// --- People of interest ---

function insertEcho(tx: Tx, glitchId: string, description: string, timestamp: string) {
  const ids = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
  tx.insert(echoes)
    .values({ echoId: nextId('EC', ids), glitchId, description, timestamp, reportingGuardianId: RELAY_GUARDIAN.guardianId })
    .run()
}

export function addCaseEntry(
  tx: Tx,
  entry: { personId: string; kind: CaseKind; body: string; classified?: boolean; glitchId?: string | null; operationId?: string | null; authorId?: string | null; timestamp: string },
) {
  tx.insert(caseEntries)
    .values({
      personId: entry.personId,
      kind: entry.kind,
      body: entry.body,
      classified: entry.classified ?? false,
      glitchId: entry.glitchId ?? null,
      operationId: entry.operationId ?? null,
      authorId: entry.authorId ?? null,
      timestamp: entry.timestamp,
    })
    .run()
}

/**
 * Open a file for every person in the roster that doesn't have one yet,
 * with their starting status, heat and a few seed entries. Idempotent.
 */
export function ensurePersons(now = new Date()) {
  const have = new Set(db.select({ id: persons.personId }).from(persons).all().map((r) => r.id))
  const missing = PERSONS.filter((p) => !have.has(p.personId))
  if (missing.length === 0) return
  db.transaction((tx) => {
    for (const p of missing) {
      const res = tx
        .insert(persons)
        .values({ personId: p.personId, status: p.start.status, heat: p.start.heat, updatedAt: now.toISOString() })
        .onConflictDoNothing()
        .run()
      if (res.changes === 0) continue
      for (const e of p.seed) {
        addCaseEntry(tx, {
          personId: p.personId,
          kind: e.kind,
          body: e.body,
          classified: e.classified,
          timestamp: new Date(now.getTime() - e.hoursAgo * 3_600_000).toISOString(),
        })
      }
    }
  })
}

export function personStatus(row: { status: string } | undefined): PersonStatus | null {
  return row && isPersonStatus(row.status) ? row.status : null
}

/**
 * Pin an incident on a person of interest: a public attribution in their
 * file, a classified note on how it came about, more heat (and a warrant
 * once it passes the threshold), a denial if they're free to publish one,
 * and a bulletin on the glitch through the civilian relay.
 * Returns false when the person can't be blamed (unknown or erased).
 */
export function attributeIncident(
  tx: Tx,
  a: {
    personId: string
    glitchId: string
    siteId: string | null
    /** Finishes "before the …", e.g. "fire". */
    what: string
    at: string
    now: Date
    /** Rough harm done, for the heat bonus. */
    harm: number
    classifiedNote: string
    operationId?: string | null
    authorId?: string | null
  },
): boolean {
  const p = personById(a.personId)
  const row = tx.select().from(persons).where(eq(persons.personId, a.personId)).get()
  const status = personStatus(row)
  if (!p || !row || !status || status === 'ERASED') return false
  const where = siteName(a.siteId) ?? 'the scene'
  const later = (ms: number) => new Date(Math.min(a.now.getTime(), new Date(a.at).getTime() + ms)).toISOString()

  addCaseEntry(tx, {
    personId: p.personId,
    kind: 'ATTRIBUTION',
    body: `Witnesses place ${p.alias} near ${where} before the ${a.what}.`,
    glitchId: a.glitchId,
    operationId: a.operationId,
    authorId: a.authorId,
    timestamp: a.at,
  })
  addCaseEntry(tx, {
    personId: p.personId,
    kind: 'NOTE',
    body: a.classifiedNote,
    classified: true,
    glitchId: a.glitchId,
    operationId: a.operationId,
    authorId: a.authorId,
    timestamp: a.at,
  })

  const heat = Math.min(100, row.heat + (status === 'DETAINED' ? 0 : ATTRIBUTION_HEAT + Math.min(15, Math.round(a.harm / 4))))
  let next: PersonStatus = status
  if (status === 'AT_LARGE' && heat >= WANTED_HEAT) {
    next = 'WANTED'
    addCaseEntry(tx, {
      personId: p.personId,
      kind: 'ACTION',
      body: `Warrant issued automatically: threat level passed ${WANTED_HEAT}.`,
      timestamp: later(60_000),
    })
  }
  tx.update(persons).set({ heat, status: next, updatedAt: a.now.toISOString() }).where(eq(persons.personId, p.personId)).run()

  if (isFree(next)) {
    addCaseEntry(tx, {
      personId: p.personId,
      kind: 'INTERCEPT',
      body: `Message traced to ${p.alias}: “We were nowhere near ${where}. Ask the Guardians what is under Ashfield.” Agency assessment: disinformation.`,
      glitchId: a.glitchId,
      timestamp: later(30 * 60_000),
    })
  }

  insertEcho(
    tx,
    a.glitchId,
    next === 'DETAINED'
      ? `Guardian bulletin: ${p.alias}, already in custody, has been charged over this incident. The streets are safer.`
      : `Guardian bulletin: ${p.alias} is wanted for questioning over this incident. Report any sighting to your nearest post. Do not approach.`,
    later(2 * 60_000),
  )
  return true
}

/** The exposure meter, from the current state of the files. */
export function loadExposure(now = new Date()): number {
  const rows = db.select({ personId: persons.personId, status: persons.status }).from(persons).all()
  const counts = db
    .select({ personId: caseEntries.personId, n: sql<number>`count(*)` })
    .from(caseEntries)
    .where(eq(caseEntries.kind, 'ATTRIBUTION'))
    .groupBy(caseEntries.personId)
    .all()
  const first = db.select({ at: min(caseEntries.timestamp) }).from(caseEntries).get()
  return computeExposure(
    {
      persons: rows.flatMap((r) => (isPersonStatus(r.status) ? [{ personId: r.personId, status: r.status }] : [])),
      attributions: Object.fromEntries(counts.map((c) => [c.personId, Number(c.n)])),
      since: first?.at ?? null,
    },
    now.getTime(),
  )
}

/**
 * The Desync pushes back: each time exposure first reaches a threshold, a
 * leak lands in a publisher's file and residents report it through the relay.
 */
export function syncExposure(now = new Date()) {
  const exposure = loadExposure(now)
  const due = LEAKS.filter((l) => l.at <= exposure)
  if (due.length === 0) return
  const fired = new Set(
    db.select({ body: caseEntries.body }).from(caseEntries).where(eq(caseEntries.kind, 'LEAK')).all().map((r) => r.body),
  )
  const pending = due.filter((l) => !fired.has(l.body))
  if (pending.length === 0) return
  const states = new Map(db.select().from(persons).all().map((r) => [r.personId, personStatus(r)]))
  const free = (id: string) => {
    const s = states.get(id)
    return s ? isFree(s) : false
  }
  ensureRelay()
  db.transaction((tx) => {
    for (const leak of pending) {
      const publisher = free(leak.by)
        ? leak.by
        : [...PERSONS].sort((x, y) => y.exposureWeight - x.exposureWeight).find((p) => free(p.personId))?.personId
      if (!publisher) continue
      const at = now.toISOString()
      addCaseEntry(tx, { personId: publisher, kind: 'LEAK', body: leak.body, timestamp: at })
      addCaseEntry(tx, { personId: publisher, kind: 'NOTE', body: leak.note, classified: true, timestamp: at })
      // Residents talk about it on whatever is open right now.
      const open =
        tx.select({ id: glitches.glitchId }).from(glitches).where(ne(glitches.status, 'FIXED')).orderBy(desc(glitches.timestamp)).get() ??
        tx.select({ id: glitches.glitchId }).from(glitches).orderBy(desc(glitches.timestamp)).get()
      if (open) insertEcho(tx, open.id, leak.echo, at)
    }
  })
}

/** Glitch id -> person id of the latest attribution on it. */
export function suspectsByGlitch(): Map<string, string> {
  const rows = db
    .select({ glitchId: caseEntries.glitchId, personId: caseEntries.personId })
    .from(caseEntries)
    .where(and(eq(caseEntries.kind, 'ATTRIBUTION'), isNotNull(caseEntries.glitchId)))
    .orderBy(caseEntries.timestamp)
    .all()
  return new Map(rows.map((r) => [r.glitchId!, r.personId]))
}
