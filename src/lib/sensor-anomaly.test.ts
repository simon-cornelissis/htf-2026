import { describe, expect, it } from 'vitest'
import { detectSensorAnomaly } from './sensor-anomaly.ts'

const now = new Date('2026-11-24T12:05:00.000Z')

describe('sensor anomaly detection', () => {
  it('flags a 40% or greater resource drop within five minutes', () => {
    expect(
      detectSensorAnomaly(
        'data_stock',
        [
          { id: 1, value: 100, timestamp: '2026-11-24T12:00:00.000Z' },
          { id: 2, value: 60, timestamp: '2026-11-24T12:05:00.000Z' },
        ],
        now,
      ),
    ).toMatchObject({ baseline: 100, current: 60, dropPercent: 40 })
  })

  it('does not trigger on smaller, stale, increasing, or baseline-free readings', () => {
    expect(
      detectSensorAnomaly(
        'data_stock',
        [
          { id: 1, value: 100, timestamp: '2026-11-24T12:00:00.000Z' },
          { id: 2, value: 61, timestamp: '2026-11-24T12:05:00.000Z' },
        ],
        now,
      ),
    ).toBeNull()
    expect(
      detectSensorAnomaly(
        'data_stock',
        [
          { id: 1, value: 100, timestamp: '2026-11-24T11:59:59.999Z' },
          { id: 2, value: 50, timestamp: '2026-11-24T12:05:00.000Z' },
        ],
        now,
      ),
    ).toBeNull()
    expect(
      detectSensorAnomaly(
        'data_stock',
        [{ id: 2, value: 50, timestamp: '2026-11-24T12:05:00.000Z' }],
        now,
      ),
    ).toBeNull()
  })
})
