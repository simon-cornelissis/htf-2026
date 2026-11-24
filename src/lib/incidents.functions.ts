import { createServerFn } from '@tanstack/react-start'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { glitches, operations, persons } from '#/db/schema.ts'
import { DISTRICTS, isDistrictId, siteName, type DistrictId } from '#/lib/districts.ts'
import { canCommand } from '#/lib/glitch.ts'
import { HISTORY_DAYS, HISTORY_LIMIT, type Incident } from '#/lib/incidents.ts'
import { computeImpact, IMPACT, type FxKind, type OperationType } from '#/lib/operations.ts'
import { isPersonStatus, personById, type Suspect } from '#/lib/persons.ts'
import { requireGuardian } from '#/lib/session.ts'
import { executeDueOperations, suspectsByGlitch } from '#/lib/world.ts'

type Row = {
  operationId: string
  glitchId: string | null
  district: DistrictId
  siteId: string
  type: OperationType
  scheduledFor: string
  outcome: 'DEFUSED' | 'DETONATED' | null
  resolvedAt: string | null
  casualties: number | null
  injured: number | null
  blastRadius: number | null
}

function toIncident(r: Row, revealOperation: boolean): Incident {
  const base = {
    key: r.glitchId ?? `x${r.operationId.replace(/\D/g, '')}`,
    glitchId: r.glitchId,
    ...(revealOperation ? { operationId: r.operationId } : {}),
    district: r.district,
    siteId: r.siteId,
    siteName: siteName(r.siteId) ?? r.siteId,
  }
  if (r.type === 'bomb' && r.outcome !== 'DETONATED') {
    // Armed or defused: a scare, but nobody got hurt.
    const defused = r.outcome === 'DEFUSED'
    return {
      ...base,
      at: defused && r.resolvedAt ? r.resolvedAt : r.scheduledFor,
      label: defused ? 'Device defused' : 'Device found',
      fx: defused ? 'calm' : 'siren',
      casualties: 0,
      injured: 0,
      radius: 0,
      countWord: 'dead',
    }
  }
  const p = IMPACT[r.type]
  // Rows from before harm was stored get the same seeded numbers they would have had.
  const harm =
    r.casualties != null && r.injured != null && r.blastRadius != null
      ? { casualties: r.casualties, injured: r.injured, blastRadius: r.blastRadius }
      : computeImpact(r.operationId, r.type, r.siteId)
  return {
    ...base,
    at: r.type === 'bomb' && r.resolvedAt ? r.resolvedAt : r.scheduledFor,
    label: p.label,
    fx: p.fx,
    casualties: harm.casualties,
    injured: harm.injured,
    radius: harm.blastRadius,
    countWord: p.countWord,
  }
}

/** Real glitches read like the staged ones: the public name follows what was reported. */
const ANOMALY_WORDS: [RegExp, OperationType][] = [
  [/\b(fire|flame|burn|blaze|smoke)/i, 'arson'],
  [/\b(fog|gas|mist|cough)/i, 'gas'],
  [/\b(spark|surge|wire|lamp.*burst)/i, 'surge'],
  [/\b(light|dark|blackout|clock)/i, 'blackout'],
  [/\b(voice|echo|replay|sound|song)/i, 'echoes'],
  [/\b(water|well|river|rain)/i, 'poison'],
  [/\b(siren|alarm|bell)/i, 'evacuation'],
  [/\b(vanish|missing|disappear)/i, 'vanish'],
  [/\b(collapse|rubble|fold|crack)/i, 'collapse'],
  [/\b(crowd|riot|fight)/i, 'riot'],
  [/\b(shelf|shelves|goods|food|bread)/i, 'supply'],
  [/\b(figure|walking|seen|shadow|backwards)/i, 'sighting'],
]

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function anomalyIncident(
  g: { glitchId: string; district: DistrictId; siteId: string | null; description: string; timestamp: string },
): Incident {
  const match = ANOMALY_WORDS.find(([re]) => re.test(g.description))?.[1]
  const h = hash(g.glitchId)
  const fx: FxKind = match ? IMPACT[match].fx : h % 2 ? 'echo' : 'flicker'
  const [lo, hi] = match ? IMPACT[match].radius : [40, 120]
  return {
    key: g.glitchId,
    glitchId: g.glitchId,
    district: g.district,
    siteId: g.siteId ?? '',
    siteName: siteName(g.siteId) ?? DISTRICTS[g.district]?.name ?? g.district,
    at: g.timestamp,
    label: match ? IMPACT[match].label : 'Anomaly',
    fx,
    casualties: 0,
    injured: 0,
    radius: Math.round((lo + ((h >>> 8) % 1000) / 1000 * (hi - lo)) / 10) * 10,
    countWord: 'dead',
  }
}

/**
 * Incidents of the last week, newest first: what happened where, and how bad.
 * Staged operations and real glitches are listed alike, so the history
 * doesn't give away which is which. Only commanders see the operation id.
 */
export const getIncidents = createServerFn({ method: 'GET' })
  .validator((input: { district?: string } | undefined) => {
    const district = input?.district
    if (district !== undefined && !isDistrictId(district)) throw new Error('Unknown district.')
    return { district: district as DistrictId | undefined }
  })
  .handler(async ({ data }): Promise<Incident[]> => {
    const guardian = requireGuardian()
    executeDueOperations()
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
    const rows = db
      .select({
        operationId: operations.operationId,
        glitchId: operations.glitchId,
        district: operations.district,
        siteId: operations.siteId,
        type: operations.type,
        scheduledFor: operations.scheduledFor,
        outcome: operations.outcome,
        resolvedAt: operations.resolvedAt,
        casualties: operations.casualties,
        injured: operations.injured,
        blastRadius: operations.blastRadius,
      })
      .from(operations)
      .where(
        and(
          eq(operations.status, 'EXECUTED'),
          gte(operations.scheduledFor, since),
          data.district ? eq(operations.district, data.district) : undefined,
        ),
      )
      .all()
    // Every executed operation, not just this week's: a staged glitch must never show up as a real one.
    const staged = new Set(
      db.select({ glitchId: operations.glitchId }).from(operations).all().flatMap((r) => (r.glitchId ? [r.glitchId] : [])),
    )
    const natural = db
      .select({
        glitchId: glitches.glitchId,
        district: glitches.district,
        siteId: glitches.siteId,
        description: glitches.description,
        timestamp: glitches.timestamp,
      })
      .from(glitches)
      .where(and(gte(glitches.timestamp, since), data.district ? eq(glitches.district, data.district) : undefined))
      .all()
      .filter((g) => !staged.has(g.glitchId))

    const reveal = canCommand(guardian.role)
    const suspects = suspectsByGlitch()
    const statuses = new Map(db.select({ id: persons.personId, status: persons.status }).from(persons).all().map((r) => [r.id, r.status]))
    const suspectFor = (glitchId: string | null): Suspect | null => {
      const id = glitchId ? suspects.get(glitchId) : undefined
      const p = personById(id)
      const status = id ? statuses.get(id) : undefined
      if (!p || !isPersonStatus(status)) return null
      return { personId: p.personId, alias: status === 'ERASED' && !reveal ? null : p.alias, status }
    }

    return [...rows.map((r) => toIncident(r, reveal)), ...natural.map(anomalyIncident)]
      .map((i) => ({ ...i, suspect: suspectFor(i.glitchId) }))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, HISTORY_LIMIT)
  })
