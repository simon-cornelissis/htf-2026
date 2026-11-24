import { createServerFn } from '@tanstack/react-start'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, lt, ne } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { auditLog, echoes, glitches, sensorReadings } from '#/db/schema.ts'
import { isDistrictId, type DistrictId } from '#/lib/districts.ts'
import { requireCommander, requireGuardian } from '#/lib/session.ts'
import { detectSensorAnomaly, SENSOR_RULES, type SensorMetric } from '#/lib/sensor-anomaly.ts'
import { ensureRelay, nextId, RELAY_GUARDIAN } from '#/lib/world.ts'
import { publishCriticalAlert } from '#/lib/notifications.server.ts'

const SENSOR_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/
const SENSOR_METRICS = Object.keys(SENSOR_RULES) as SensorMetric[]
const READING_RETENTION_MS = 7 * 24 * 60 * 60_000

export const getSensorStatus = createServerFn({ method: 'GET' })
  .validator((input?: { district?: string }) => {
    if (input?.district && !isDistrictId(input.district)) throw new Error('Unknown district.')
    return { district: input?.district as DistrictId | undefined }
  })
  .handler(async ({ data }) => {
    requireGuardian()
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const readings = db
      .select()
      .from(sensorReadings)
      .where(and(gte(sensorReadings.timestamp, since), data.district ? eq(sensorReadings.district, data.district) : undefined))
      .orderBy(desc(sensorReadings.timestamp))
      .limit(200)
      .all()
    const openAnomalies = db
      .select({
        glitchId: glitches.glitchId,
        district: glitches.district,
        description: glitches.description,
        timestamp: glitches.timestamp,
        severity: glitches.severity,
      })
      .from(glitches)
      .where(and(ne(glitches.status, 'FIXED'), data.district ? eq(glitches.district, data.district) : undefined))
      .all()
      .filter((glitch) => glitch.description.startsWith('[AUTO-SENSOR:'))

    return {
      windowMinutes: 5,
      rules: SENSOR_METRICS.map((metric) => ({
        metric,
        direction: SENSOR_RULES[metric].direction,
        percent: SENSOR_RULES[metric].percent,
        windowMinutes: SENSOR_RULES[metric].windowMs / 60_000,
      })),
      readings,
      openAnomalies,
    }
  })

export const ingestSensorReading = createServerFn({ method: 'POST' })
  .validator((input: { sensorId: string; district: string; metric: string; value: number }) => {
    if (!input || typeof input.sensorId !== 'string' || !SENSOR_ID.test(input.sensorId)) {
      throw new Error('Sensor id must be 1–64 letters, numbers, dots, underscores, colons or hyphens.')
    }
    if (!isDistrictId(input.district)) throw new Error('Choose a valid district.')
    if (!SENSOR_METRICS.includes(input.metric as SensorMetric)) {
      throw new Error(`Unsupported metric. Supported metrics: ${SENSOR_METRICS.join(', ')}.`)
    }
    if (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0 || input.value > 1e12) {
      throw new Error('Sensor value must be a finite number from 0 to 1,000,000,000,000.')
    }
    return {
      sensorId: input.sensorId,
      district: input.district,
      metric: input.metric as SensorMetric,
      value: input.value,
    }
  })
  .handler(async ({ data }) => {
    const commander = requireCommander()
    const now = new Date()
    const timestamp = now.toISOString()
    const cutoff = new Date(now.getTime() - SENSOR_RULES[data.metric].windowMs).toISOString()
    const retentionCutoff = new Date(now.getTime() - READING_RETENTION_MS).toISOString()
    ensureRelay()

    const result = db.transaction((tx) => {
      tx.delete(sensorReadings)
        .where(
          and(
            eq(sensorReadings.sensorId, data.sensorId),
            eq(sensorReadings.metric, data.metric),
            lt(sensorReadings.timestamp, retentionCutoff),
          ),
        )
        .run()
      const inserted = tx
        .insert(sensorReadings)
        .values({
          sensorId: data.sensorId,
          district: data.district,
          metric: data.metric,
          value: data.value,
          timestamp,
        })
        .returning({ id: sensorReadings.id })
        .get()
      if (!inserted) throw new Error('The sensor reading could not be stored.')

      const samples = tx
        .select({ id: sensorReadings.id, value: sensorReadings.value, timestamp: sensorReadings.timestamp })
        .from(sensorReadings)
        .where(
          and(
            eq(sensorReadings.sensorId, data.sensorId),
            eq(sensorReadings.district, data.district),
            eq(sensorReadings.metric, data.metric),
            gte(sensorReadings.timestamp, cutoff),
          ),
        )
        .orderBy(asc(sensorReadings.timestamp))
        .all()
      const anomaly = detectSensorAnomaly(data.metric, samples, now)
      if (!anomaly) return { readingId: inserted.id, anomaly: null }

      const marker = `[AUTO-SENSOR:${data.metric}:${data.sensorId}]`
      const existing = tx
        .select({ glitchId: glitches.glitchId, description: glitches.description })
        .from(glitches)
        .where(and(eq(glitches.district, data.district), ne(glitches.status, 'FIXED')))
        .all()
        .find((glitch) => glitch.description.startsWith(marker))

      if (existing) {
        return {
          readingId: inserted.id,
          anomaly: { ...anomaly, glitchId: existing.glitchId, created: false },
        }
      }

      const description =
        `${marker} ${data.metric.replaceAll('_', ' ')} fell ${anomaly.dropPercent.toFixed(1)}% ` +
        `from ${anomaly.baseline} to ${anomaly.current} within five minutes.`
      const glitchIds = tx.select({ id: glitches.glitchId }).from(glitches).all().map((row) => row.id)
      const glitchId = nextId('GL', glitchIds)
      tx.insert(glitches)
        .values({
          glitchId,
          status: 'LEAKED',
          district: data.district,
          description,
          timestamp,
          type: 'resource_depletion',
          severity: 4,
        })
        .run()
      const echoIds = tx.select({ id: echoes.echoId }).from(echoes).all().map((row) => row.id)
      const echoId = nextId('EC', echoIds)
      tx.insert(echoes)
        .values({
          echoId,
          glitchId,
          description: `Automated anomaly detection: sensor ${data.sensorId} reported ${description}`,
          timestamp,
          reportingGuardianId: RELAY_GUARDIAN.guardianId,
        })
        .run()
      tx.insert(auditLog)
        .values({
          traceId: randomUUID(),
          agent: 'sensor-anomaly',
          inputIds: JSON.stringify(anomaly.inputIds),
          decision: `Opened ${glitchId}: ${data.metric} fell ${anomaly.dropPercent.toFixed(1)}% in ${(anomaly.elapsedMs / 60_000).toFixed(2)} minutes.`,
          confidence: 1,
          outcome: 'executed',
          timestamp,
        })
        .run()

      return {
        readingId: inserted.id,
        anomaly: { ...anomaly, glitchId, created: true },
      }
    })

    if (result.anomaly?.created) {
      publishCriticalAlert({
        eventKey: `sensor-anomaly:${result.anomaly.glitchId}`,
        kind: 'SENSOR_ANOMALY',
        title: 'Predictive sensor anomaly',
        body: `${data.metric.replaceAll('_', ' ')} in ${data.district} fell ${result.anomaly.dropPercent.toFixed(1)}% within five minutes.`,
        href: `/glitches/${result.anomaly.glitchId}`,
      })
    }

    return {
      readingId: result.readingId,
      anomaly: result.anomaly
        ? {
            ...result.anomaly,
            elapsedMinutes: Number((result.anomaly.elapsedMs / 60_000).toFixed(2)),
          }
        : null,
    }
  })
