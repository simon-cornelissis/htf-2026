export const SENSOR_RULES = {
  data_stock: { direction: 'drop', percent: 40, windowMs: 5 * 60_000 },
  magic_reserve: { direction: 'drop', percent: 40, windowMs: 5 * 60_000 },
} as const

export type SensorMetric = keyof typeof SENSOR_RULES

export type SensorSample = {
  id: number
  value: number
  timestamp: string
}

export type SensorAnomaly = {
  metric: SensorMetric
  baseline: number
  current: number
  dropPercent: number
  elapsedMs: number
  inputIds: number[]
}

export function detectSensorAnomaly(
  metric: SensorMetric,
  samples: readonly SensorSample[],
  now: Date,
): SensorAnomaly | null {
  const rule = SENSOR_RULES[metric]
  const cutoff = now.getTime() - rule.windowMs
  const recent = samples
    .filter((sample) => {
      const time = Date.parse(sample.timestamp)
      return Number.isFinite(time) && time >= cutoff && time <= now.getTime()
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (recent.length < 2) return null

  const baseline = recent[0]
  const current = recent[recent.length - 1]
  const elapsedMs = Date.parse(current.timestamp) - Date.parse(baseline.timestamp)
  if (elapsedMs <= 0 || baseline.value <= 0 || current.value >= baseline.value) return null

  const dropPercent = ((baseline.value - current.value) / baseline.value) * 100
  if (dropPercent < rule.percent) return null

  return {
    metric,
    baseline: baseline.value,
    current: current.value,
    dropPercent,
    elapsedMs,
    inputIds: [baseline.id, current.id],
  }
}
