import { createServerFn } from '@tanstack/react-start'
import { randomUUID } from 'node:crypto'
import { asc, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { echoImages, echoes, glitches, guardians } from '#/db/schema.ts'
import {
  GLITCH_STATUSES,
  type GlitchDetail,
  type GlitchStatus,
  type GlitchSummary,
  canCommand,
} from '#/lib/glitch.ts'
import { isDistrictId, parseSiteId, type DistrictId } from '#/lib/districts.ts'
import { requireCommander, requireGuardian, requireReporter } from '#/lib/session.ts'
import { isCriticalReport, normalizeEchoImages } from '#/lib/user-engagement.ts'
import { publishCriticalAlert } from '#/lib/notifications.server.ts'
import { executeDueOperations, nextId, stagedGlitches } from '#/lib/world.ts'

const MAX_DESCRIPTION = 500

export const getGlitches = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GlitchSummary[]> => {
    const guardian = requireGuardian()
    executeDueOperations()
    const rows = db
      .select({
        glitchId: glitches.glitchId,
        status: glitches.status,
        district: glitches.district,
        siteId: glitches.siteId,
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
    // Staged glitches look real to defenders. Only commanders learn which ones were planted.
    if (!canCommand(guardian.role)) return rows
    const staged = stagedGlitches()
    return rows.map((r) => ({ ...r, stagedBy: staged.get(r.glitchId) ?? null }))
  },
)

export const getGlitch = createServerFn({ method: 'GET' })
  .validator((glitchId: string) => String(glitchId))
  .handler(async ({ data: glitchId }): Promise<GlitchDetail | null> => {
    const guardian = requireGuardian()
    executeDueOperations()
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
    const images = rows.length
      ? db
          .select({
            imageId: echoImages.imageId,
            echoId: echoImages.echoId,
            fileName: echoImages.fileName,
            mimeType: echoImages.mimeType,
            byteSize: echoImages.byteSize,
          })
          .from(echoImages)
          .where(inArray(echoImages.echoId, rows.map((row) => row.echoId)))
          .all()
      : []
    const imagesByEcho = new Map<string, typeof images>()
    for (const image of images) {
      const current = imagesByEcho.get(image.echoId) ?? []
      current.push(image)
      imagesByEcho.set(image.echoId, current)
    }
    const stagedBy = canCommand(guardian.role) ? (stagedGlitches().get(glitchId) ?? null) : undefined
    return {
      ...glitch,
      echoes: rows.map((echo) => ({ ...echo, images: imagesByEcho.get(echo.echoId) ?? [] })),
      stagedBy,
    }
  })

/**
 * Report an echo. Without a glitchId, every echo opens a new glitch (LEAKED);
 * with one, it adds an update to that glitch.
 */
export const reportEcho = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      description: string
      glitchId?: string
      district?: DistrictId
      siteId?: string
      images?: unknown
    }) => {
      const description = String(input.description ?? '').trim()
      if (description.length < 3) throw new Error('Describe what you saw, at least a few words.')
      if (description.length > MAX_DESCRIPTION) {
        throw new Error(`Keep it under ${MAX_DESCRIPTION} characters.`)
      }
      const glitchId = input.glitchId ? String(input.glitchId) : undefined
      if (!glitchId && !isDistrictId(input.district)) throw new Error('Pick the district where you saw it.')
      const site = parseSiteId(input.siteId)
      if (input.siteId && (!site || site.district !== input.district)) throw new Error('That site isn’t in this district.')
      const images = normalizeEchoImages(input.images)
      return { description, glitchId, district: input.district, siteId: site ? input.siteId! : null, images }
    },
  )
  .handler(async ({ data }): Promise<{ glitchId: string; echoId: string }> => {
    const guardian = requireReporter()
    const timestamp = new Date().toISOString()

    const result = db.transaction((tx) => {
      let glitchId = data.glitchId
      let district = data.district
      let severity: number | null = null
      let critical = false
      if (glitchId) {
        const existing = tx
          .select({ id: glitches.glitchId, district: glitches.district, severity: glitches.severity })
          .from(glitches)
          .where(eq(glitches.glitchId, glitchId))
          .get()
        if (!existing) throw new Error(`Glitch ${glitchId} no longer exists.`)
        district = existing.district
        severity = existing.severity
        critical = (severity ?? 0) >= 4 || isCriticalReport(data.description)
      } else {
        const ids = tx.select({ id: glitches.glitchId }).from(glitches).all().map((r) => r.id)
        glitchId = nextId('GL', ids)
        severity = isCriticalReport(data.description) ? 5 : 2
        critical = severity >= 4
        tx.insert(glitches)
          .values({
            glitchId,
            status: 'LEAKED',
            district: data.district!,
            siteId: data.siteId,
            description: data.description,
            timestamp,
            severity,
          })
          .run()
      }
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((r) => r.id)
      const echoId = nextId('EC', echoIds)
      tx.insert(echoes)
        .values({ echoId, glitchId, description: data.description, timestamp, reportingGuardianId: guardian.guardianId })
        .run()
      for (const image of data.images) {
        tx.insert(echoImages)
          .values({
            imageId: randomUUID(),
            echoId,
            fileName: image.fileName,
            mimeType: image.mimeType,
            byteSize: image.byteSize,
            data: Buffer.from(image.base64, 'base64'),
            createdAt: timestamp,
          })
          .run()
      }
      return { glitchId, echoId, district, critical }
    })
    if (result.critical) {
      publishCriticalAlert({
        eventKey: `critical-report:${result.glitchId}`,
        kind: 'CRITICAL_REPORT',
        title: 'Critical glitch reported',
        body: `A critical incident was reported in ${result.district}.`,
        href: `/glitches/${result.glitchId}`,
      })
    }
    return { glitchId: result.glitchId, echoId: result.echoId }
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
