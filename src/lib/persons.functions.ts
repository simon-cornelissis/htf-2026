import { createServerFn } from '@tanstack/react-start'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { caseEntries, glitches, guardians, persons } from '#/db/schema.ts'
import type { DistrictId } from '#/lib/districts.ts'
import { canCommand } from '#/lib/glitch.ts'
import {
  CASE_KINDS,
  exposureTier,
  isPersonStatus,
  personById,
  PERSONS,
  publicTrust,
  WANTED_HEAT,
  type CaseEntryView,
  type CaseKind,
  type Person,
  type PersonCard,
  type PersonFile,
  type PersonStatus,
  type Suspect,
} from '#/lib/persons.ts'
import { requireCommander, requireGuardian } from '#/lib/session.ts'
import {
  addCaseEntry,
  attributeIncident,
  ensureRelay,
  executeDueOperations,
  loadExposure,
  personStatus,
  stagedGlitches,
  suspectsByGlitch,
} from '#/lib/world.ts'

type StateRow = { personId: string; status: string; heat: number }

function card(p: Person, row: StateRow, cleared: boolean, stats: { n: number; last: string | null }): PersonCard {
  const status: PersonStatus = isPersonStatus(row.status) ? row.status : 'AT_LARGE'
  // An erased record goes dark for everyone below commander.
  const dark = status === 'ERASED' && !cleared
  return {
    personId: p.personId,
    alias: dark ? null : p.alias,
    realName: dark || (p.realNameClassified && !cleared) ? null : p.realName,
    role: dark ? null : p.role,
    district: p.district as DistrictId,
    status,
    heat: row.heat,
    entryCount: dark ? 0 : stats.n,
    lastEntryAt: dark ? null : stats.last,
  }
}

function entryStats(): Map<string, { n: number; last: string | null }> {
  const rows = db
    .select({ personId: caseEntries.personId, n: sql<number>`count(*)`, last: sql<string | null>`max(${caseEntries.timestamp})` })
    .from(caseEntries)
    .groupBy(caseEntries.personId)
    .all()
  return new Map(rows.map((r) => [r.personId, { n: Number(r.n), last: r.last }]))
}

/** The persons of interest index: one dossier card each. */
export const getPersons = createServerFn({ method: 'GET' }).handler(async (): Promise<PersonCard[]> => {
  const guardian = requireGuardian()
  executeDueOperations()
  const cleared = canCommand(guardian.role)
  const rows = new Map(db.select().from(persons).all().map((r) => [r.personId, r]))
  const stats = entryStats()
  return PERSONS.flatMap((p) => {
    const row = rows.get(p.personId)
    return row ? [card(p, row, cleared, stats.get(p.personId) ?? { n: 0, last: null })] : []
  })
})

/** One case file. Classified entries come without their text unless the viewer is cleared. */
export const getPerson = createServerFn({ method: 'GET' })
  .validator((personId: string) => String(personId))
  .handler(async ({ data: personId }): Promise<PersonFile | null> => {
    const guardian = requireGuardian()
    executeDueOperations()
    const p = personById(personId)
    const row = p ? db.select().from(persons).where(eq(persons.personId, personId)).get() : undefined
    if (!p || !row) return null
    const cleared = canCommand(guardian.role)
    const rows = db
      .select({
        id: caseEntries.id,
        kind: caseEntries.kind,
        body: caseEntries.body,
        classified: caseEntries.classified,
        glitchId: caseEntries.glitchId,
        operationId: caseEntries.operationId,
        authorCodename: guardians.codename,
        timestamp: caseEntries.timestamp,
      })
      .from(caseEntries)
      .leftJoin(guardians, eq(caseEntries.authorId, guardians.guardianId))
      .where(eq(caseEntries.personId, personId))
      .orderBy(asc(caseEntries.timestamp), asc(caseEntries.id))
      .all()
    const base = card(p, row, cleared, { n: rows.length, last: rows.at(-1)?.timestamp ?? null })
    const attributions = rows.filter((r) => r.kind === 'ATTRIBUTION').length
    if (base.status === 'ERASED' && !cleared) {
      return { ...base, profile: null, entries: [], attributions: 0 }
    }
    const entries: CaseEntryView[] = rows.map((r) => {
      const hidden = r.classified && !cleared
      return {
        id: r.id,
        kind: (CASE_KINDS.includes(r.kind as CaseKind) ? r.kind : 'NOTE') as CaseKind,
        body: hidden ? null : r.body,
        length: r.body.length,
        classified: r.classified,
        glitchId: hidden ? null : r.glitchId,
        ...(cleared ? { operationId: r.operationId } : {}),
        authorCodename: hidden ? null : r.authorCodename,
        timestamp: r.timestamp,
      }
    })
    return { ...base, profile: p.profile, ...(cleared ? { truth: p.truth } : {}), entries, attributions }
  })

/** Who an operation can be pinned on. Commanders only; erased records are gone. */
export const getPersonOptions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ personId: string; alias: string; role: string; status: PersonStatus; heat: number }[]> => {
    requireCommander()
    executeDueOperations()
    const rows = new Map(db.select().from(persons).all().map((r) => [r.personId, r]))
    return PERSONS.flatMap((p) => {
      const status = personStatus(rows.get(p.personId))
      if (!status || status === 'ERASED') return []
      return [{ personId: p.personId, alias: p.alias, role: p.role, status, heat: rows.get(p.personId)!.heat }]
    })
  },
)

export const PERSON_ACTIONS = ['warrant', 'detain', 'erase'] as const
export type PersonAction = (typeof PERSON_ACTIONS)[number]

/** Commander orders on a person: issue a warrant, detain, or erase the record. */
export const actOnPerson = createServerFn({ method: 'POST' })
  .validator((input: { personId: string; action: PersonAction }) => {
    if (!PERSON_ACTIONS.includes(input.action)) throw new Error('Unknown order.')
    if (!personById(input.personId)) throw new Error('Unknown person of interest.')
    return { personId: String(input.personId), action: input.action }
  })
  .handler(async ({ data }) => {
    const commander = requireCommander()
    executeDueOperations()
    const row = db.select().from(persons).where(eq(persons.personId, data.personId)).get()
    const status = personStatus(row)
    if (!row || !status) throw new Error('Unknown person of interest.')
    const now = new Date().toISOString()
    const by = commander.codename
    const plan: { status: PersonStatus; heat: number; body: string; note?: string } | null =
      data.action === 'warrant'
        ? status === 'AT_LARGE'
          ? { status: 'WANTED', heat: Math.max(row.heat, WANTED_HEAT), body: `Warrant issued by ${by}.` }
          : null
        : data.action === 'detain'
          ? status === 'AT_LARGE' || status === 'WANTED'
            ? { status: 'DETAINED', heat: 0, body: `Detained on the order of ${by}. Taken to a holding facility for questioning.` }
            : null
          : status !== 'ERASED'
            ? {
                status: 'ERASED',
                heat: 0,
                body: `Record erased by order of ${by}. This person is no longer a matter of public record.`,
                note: 'Subject relocated beyond the Old Reach watchposts. Do not reopen this file.',
              }
            : null
    if (!plan) {
      throw new Error(
        data.action === 'warrant'
          ? 'A warrant only applies to someone at large.'
          : data.action === 'detain'
            ? 'Only someone at large or wanted can be detained.'
            : 'This record was already erased.',
      )
    }
    db.transaction((tx) => {
      tx.update(persons).set({ status: plan.status, heat: plan.heat, updatedAt: now }).where(eq(persons.personId, data.personId)).run()
      addCaseEntry(tx, { personId: data.personId, kind: 'ACTION', body: plan.body, authorId: commander.guardianId, timestamp: now })
      if (plan.note) addCaseEntry(tx, { personId: data.personId, kind: 'NOTE', body: plan.note, classified: true, authorId: commander.guardianId, timestamp: now })
    })
  })

const MAX_NOTE = 400

export const addCaseNote = createServerFn({ method: 'POST' })
  .validator((input: { personId: string; body: string; classified?: boolean }) => {
    const body = String(input.body ?? '').trim()
    if (body.length < 3) throw new Error('Write at least a few words.')
    if (body.length > MAX_NOTE) throw new Error(`Keep it under ${MAX_NOTE} characters.`)
    if (!personById(input.personId)) throw new Error('Unknown person of interest.')
    return { personId: String(input.personId), body, classified: Boolean(input.classified) }
  })
  .handler(async ({ data }) => {
    const commander = requireCommander()
    executeDueOperations()
    db.transaction((tx) =>
      addCaseEntry(tx, {
        personId: data.personId,
        kind: 'NOTE',
        body: data.body,
        classified: data.classified,
        authorId: commander.guardianId,
        timestamp: new Date().toISOString(),
      }),
    )
  })

export type ExposureView =
  | { clearance: 'command'; exposure: number; tier: string; tone: 'green' | 'amber' | 'red' }
  | { clearance: 'public'; trust: number }

/** Commanders get the real number; everyone else an innocuous public trust figure. */
export const getExposure = createServerFn({ method: 'GET' }).handler(async (): Promise<ExposureView> => {
  const guardian = requireGuardian()
  executeDueOperations()
  const exposure = loadExposure()
  if (!canCommand(guardian.role)) return { clearance: 'public', trust: publicTrust(exposure) }
  const t = exposureTier(exposure)
  return { clearance: 'command', exposure, tier: t.label, tone: t.tone }
})

export type Residue =
  | { cleared: false }
  | { cleared: true; kind: 'natural' | 'origin' | 'staged'; line: string; operationId?: string }

export type GlitchCase = { suspect: Suspect | null; residue: Residue }

function residueFor(glitchId: string, district: DistrictId, staged: string | undefined): Residue {
  let h = 0
  for (const c of glitchId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const reading = (0.4 + (h % 900) / 100).toFixed(2)
  if (staged) {
    return { cleared: true, kind: 'staged', operationId: staged, line: `No Lodestar residue. Staged under ${staged}. Keep the public line.` }
  }
  if (district === 'ashfield') {
    return {
      cleared: true,
      kind: 'origin',
      line: `Lodestar residue ${(Number(reading) * 4).toFixed(2)} µL/m³. Within the Meridian perimeter. Keep patrols away from the depot cellars.`,
    }
  }
  return { cleared: true, kind: 'natural', line: `Lodestar residue signature confirmed: ${reading} µL/m³. Origin: Meridian leak, Ashfield. Public line: Desync activity.` }
}

/** Who the agency blames for a glitch, and (commanders only) what really caused it. */
export const getGlitchCase = createServerFn({ method: 'GET' })
  .validator((glitchId: string) => String(glitchId))
  .handler(async ({ data: glitchId }): Promise<GlitchCase | null> => {
    const guardian = requireGuardian()
    const g = db.select({ district: glitches.district }).from(glitches).where(eq(glitches.glitchId, glitchId)).get()
    if (!g) return null
    const cleared = canCommand(guardian.role)
    const personId = suspectsByGlitch().get(glitchId)
    const p = personById(personId)
    const status = p ? personStatus(db.select({ status: persons.status }).from(persons).where(eq(persons.personId, p.personId)).get()) : null
    const suspect: Suspect | null =
      p && status ? { personId: p.personId, alias: status === 'ERASED' && !cleared ? null : p.alias, status } : null
    return {
      suspect,
      residue: cleared ? residueFor(glitchId, g.district, stagedGlitches().get(glitchId)) : { cleared: false },
    }
  })

/** Commanders: pin any glitch, staged or not, on a person of interest. */
export const attributeGlitch = createServerFn({ method: 'POST' })
  .validator((input: { glitchId: string; personId: string }) => {
    if (!personById(input.personId)) throw new Error('Pick a person of interest.')
    return { glitchId: String(input.glitchId), personId: String(input.personId) }
  })
  .handler(async ({ data }) => {
    const commander = requireCommander()
    executeDueOperations()
    const g = db.select().from(glitches).where(eq(glitches.glitchId, data.glitchId)).get()
    if (!g) throw new Error('That glitch no longer exists.')
    if (suspectsByGlitch().has(data.glitchId)) throw new Error('This glitch is already attributed.')
    const op = stagedGlitches().get(data.glitchId)
    ensureRelay()
    const now = new Date()
    const ok = db.transaction((tx) =>
      attributeIncident(tx, {
        personId: data.personId,
        glitchId: data.glitchId,
        siteId: g.siteId,
        what: 'anomaly',
        at: now.toISOString(),
        now,
        harm: 0,
        classifiedNote: op
          ? `Pinned by ${commander.codename} after the fact. Staged under ${op}.`
          : `Pinned by ${commander.codename}. Natural Lodestar event. No evidence on file; none needed.`,
        operationId: op ?? null,
        authorId: commander.guardianId,
      }),
    )
    if (!ok) throw new Error('That record was erased. Nobody can be blamed who never existed.')
  })
