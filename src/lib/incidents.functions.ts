import { createServerFn } from '@tanstack/react-start'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { operations } from '#/db/schema.ts'
import { isDistrictId, siteName, type DistrictId } from '#/lib/districts.ts'
import { canCommand } from '#/lib/glitch.ts'
import { HISTORY_DAYS, HISTORY_LIMIT, type Incident } from '#/lib/incidents.ts'
import { computeImpact, IMPACT, type OperationType } from '#/lib/operations.ts'
import { requireGuardian } from '#/lib/session.ts'
import { executeDueOperations } from '#/lib/world.ts'

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

/**
 * Incidents of the last week, newest first: what happened where, and how bad.
 * Everyone signed in sees them; only commanders see which operation it was.
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
    const reveal = canCommand(guardian.role)
    return rows
      .map((r) => toIncident(r, reveal))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, HISTORY_LIMIT)
  })
