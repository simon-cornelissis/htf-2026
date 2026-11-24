import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { guardians, operations } from '#/db/schema.ts'
import { isDistrictId, parseSiteId, DISTRICTS, type DistrictId } from '#/lib/districts.ts'
import {
  chatterFor,
  OPERATION_META,
  OPERATION_TYPES,
  type DistrictMood,
  type OperationStatus,
  type OperationType,
} from '#/lib/operations.ts'
import { requireCommander, requireGuardian } from '#/lib/session.ts'
import { executeDueOperations, loadMoods, nextId } from '#/lib/world.ts'
import { canCommand } from '#/lib/glitch.ts'

export type Operation = {
  operationId: string
  district: DistrictId
  siteId: string
  type: OperationType
  coverStory: string
  scheduledFor: string
  createdAt: string
  status: OperationStatus
  glitchId: string | null
  plannerCodename: string
}

/** Mood of every district. Defenders see the same numbers, but not what caused them. */
export const getMoods = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<DistrictId, DistrictMood>> => {
    const guardian = requireGuardian()
    executeDueOperations()
    return loadMoods(canCommand(guardian.role))
  },
)

export const getDistrict = createServerFn({ method: 'GET' })
  .validator((district: string) => {
    if (!isDistrictId(district)) throw new Error('Unknown district.')
    return district
  })
  .handler(
    async ({ data: district }): Promise<{ mood: DistrictMood; chatter: string[]; operations: Operation[] | null }> => {
      const guardian = requireGuardian()
      executeDueOperations()
      const isCommander = canCommand(guardian.role)
      const mood = loadMoods(isCommander)[district]
      const ops = isCommander
        ? db
            .select({
              operationId: operations.operationId,
              district: operations.district,
              siteId: operations.siteId,
              type: operations.type,
              coverStory: operations.coverStory,
              scheduledFor: operations.scheduledFor,
              createdAt: operations.createdAt,
              status: operations.status,
              glitchId: operations.glitchId,
              plannerCodename: guardians.codename,
            })
            .from(operations)
            .innerJoin(guardians, eq(operations.plannerId, guardians.guardianId))
            .where(eq(operations.district, district))
            .orderBy(desc(operations.scheduledFor))
            .all()
        : null
      return { mood, chatter: chatterFor(district, mood), operations: ops }
    },
  )

const MAX_DELAY_MINUTES = 24 * 60

export const planOperation = createServerFn({ method: 'POST' })
  .validator((input: { siteId: string; type: OperationType; delayMinutes: number; coverStory?: string }) => {
    const site = parseSiteId(input.siteId)
    if (!site) throw new Error('Pick a site for the operation.')
    if (!OPERATION_TYPES.includes(input.type)) throw new Error('Pick an operation type.')
    const delayMinutes = Math.round(Number(input.delayMinutes))
    if (!Number.isFinite(delayMinutes) || delayMinutes < 0 || delayMinutes > MAX_DELAY_MINUTES) {
      throw new Error('Schedule it within the next 24 hours.')
    }
    const name = DISTRICTS[site.district].sites[site.type]
    const coverStory = (input.coverStory ?? '').trim() || OPERATION_META[input.type].cover(name)
    if (coverStory.length > 300) throw new Error('Keep the cover story under 300 characters.')
    return { siteId: input.siteId, district: site.district, type: input.type, delayMinutes, coverStory }
  })
  .handler(async ({ data }): Promise<{ operationId: string }> => {
    const commander = requireCommander()
    const now = new Date()
    const ids = db.select({ id: operations.operationId }).from(operations).all().map((r) => r.id)
    const operationId = nextId('OP', ids)
    db.insert(operations)
      .values({
        operationId,
        district: data.district,
        siteId: data.siteId,
        type: data.type,
        coverStory: data.coverStory,
        scheduledFor: new Date(now.getTime() + data.delayMinutes * 60_000).toISOString(),
        createdAt: now.toISOString(),
        plannerId: commander.guardianId,
        status: 'PLANNED',
      })
      .run()
    // "Now" operations go off immediately.
    executeDueOperations()
    return { operationId }
  })

export const cancelOperation = createServerFn({ method: 'POST' })
  .validator((operationId: string) => String(operationId))
  .handler(async ({ data: operationId }) => {
    requireCommander()
    executeDueOperations()
    const result = db
      .update(operations)
      .set({ status: 'CANCELLED' })
      .where(and(eq(operations.operationId, operationId), eq(operations.status, 'PLANNED')))
      .run()
    if (result.changes === 0) throw new Error('Too late: it already went off, or was cancelled.')
  })

