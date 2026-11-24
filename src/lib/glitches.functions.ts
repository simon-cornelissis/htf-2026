import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, max, sql } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { echoes, glitches, guardians } from '#/db/schema.ts'
import {
  GLITCH_STATUSES,
  type GlitchDetail,
  type GlitchStatus,
  type GlitchSummary,
} from '#/lib/glitch.ts'
import { isDistrictId, type DistrictId } from '#/lib/districts.ts'
import { requireCommander, requireGuardian } from '#/lib/session.ts'

const MAX_DESCRIPTION = 500

export const getGlitches = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GlitchSummary[]> => {
    requireGuardian()
    return db
      .select({
        glitchId: glitches.glitchId,
        status: glitches.status,
        district: glitches.district,
        description: glitches.description,
        timestamp: glitches.timestamp,
        echoCount: sql<number>`count(${echoes.echoId})`,
        lastEchoAt: max(echoes.timestamp),
      })
      .from(glitches)
      .leftJoin(echoes, eq(echoes.glitchId, glitches.glitchId))
      .groupBy(glitches.glitchId)
      .orderBy(desc(glitches.timestamp))
      .all()
  },
)

export const getGlitch = createServerFn({ method: 'GET' })
  .validator((glitchId: string) => String(glitchId))
  .handler(async ({ data: glitchId }): Promise<GlitchDetail | null> => {
    requireGuardian()
    const glitch = db
      .select()
      .from(glitches)
      .where(eq(glitches.glitchId, glitchId))
      .get()
    if (!glitch) return null
    const rows = db
      .select({
        echoId: echoes.echoId,
        glitchId: echoes.glitchId,
        description: echoes.description,
        timestamp: echoes.timestamp,
        reportingGuardianId: echoes.reportingGuardianId,
        reportingCodename: guardians.codename,
      })
      .from(echoes)
      .innerJoin(guardians, eq(echoes.reportingGuardianId, guardians.guardianId))
      .where(eq(echoes.glitchId, glitchId))
      .orderBy(asc(echoes.timestamp))
      .all()
    return { ...glitch, echoes: rows }
  })

/** Next id like GL-0143, from the highest existing number. */
function nextId(prefix: 'GL' | 'EC', ids: string[]): string {
  const highest = ids.reduce((top, id) => {
    const n = Number(id.split('-')[1])
    return Number.isFinite(n) && n > top ? n : top
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}

/**
 * Report an echo. Without a glitchId, every echo opens a new glitch (LEAKED);
 * with one, it adds an update to that glitch.
 */
export const reportEcho = createServerFn({ method: 'POST' })
  .validator((input: { description: string; glitchId?: string; district?: DistrictId }) => {
    const description = String(input.description ?? '').trim()
    if (description.length < 3) throw new Error('Describe what you saw, at least a few words.')
    if (description.length > MAX_DESCRIPTION) {
      throw new Error(`Keep it under ${MAX_DESCRIPTION} characters.`)
    }
    const glitchId = input.glitchId ? String(input.glitchId) : undefined
    if (!glitchId && !isDistrictId(input.district)) throw new Error('Pick the district where you saw it.')
    return { description, glitchId, district: input.district }
  })
  .handler(async ({ data }): Promise<{ glitchId: string; echoId: string }> => {
    const guardian = requireGuardian()
    const timestamp = new Date().toISOString()

    return db.transaction((tx) => {
      let glitchId = data.glitchId
      if (glitchId) {
        const exists = tx.select({ id: glitches.glitchId }).from(glitches).where(eq(glitches.glitchId, glitchId)).get()
        if (!exists) throw new Error(`Glitch ${glitchId} no longer exists.`)
      } else {
        const ids = tx.select({ id: glitches.glitchId }).from(glitches).all().map((r) => r.id)
        glitchId = nextId('GL', ids)
        tx.insert(glitches).values({ glitchId, status: 'LEAKED', district: data.district!, description: data.description, timestamp }).run()
      }
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
      const echoId = nextId('EC', echoIds)
      tx.insert(echoes)
        .values({ echoId, glitchId, description: data.description, timestamp, reportingGuardianId: guardian.guardianId })
        .run()
      return { glitchId, echoId }
    })
  })

export const setGlitchStatus = createServerFn({ method: 'POST' })
  .validator((input: { glitchId: string; status: GlitchStatus }) => {
    if (!GLITCH_STATUSES.includes(input.status)) throw new Error('Unknown status.')
    return { glitchId: String(input.glitchId), status: input.status }
  })
  .handler(async ({ data }) => {
    requireCommander()
    db.update(glitches).set({ status: data.status }).where(eq(glitches.glitchId, data.glitchId)).run()
  })

export const deleteGlitch = createServerFn({ method: 'POST' })
  .validator((glitchId: string) => String(glitchId))
  .handler(async ({ data: glitchId }) => {
    requireCommander()
    // Echoes go with it (ON DELETE CASCADE).
    db.delete(glitches).where(eq(glitches.glitchId, glitchId)).run()
  })

export const deleteEcho = createServerFn({ method: 'POST' })
  .validator((echoId: string) => String(echoId))
  .handler(async ({ data: echoId }) => {
    requireCommander()
    db.delete(echoes).where(eq(echoes.echoId, echoId)).run()
  })
