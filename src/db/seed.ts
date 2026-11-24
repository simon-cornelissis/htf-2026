import { db } from './index.ts'
import { echoes, glitches, guardians, operations, sessions } from './schema.ts'
import { hashPassword } from '../lib/password.ts'

/** Demo password for every seeded guardian. */
const DEMO_PASSWORD = 'guest'

const guardianRows: (typeof guardians.$inferInsert)[] = [
  // Anonymous civilian tip line: staged reports come through here. Can't sign in.
  { guardianId: 'GD-000', codename: 'CIVILIAN RELAY', role: 'defender', passwordHash: '!' },
  { guardianId: 'GD-001', codename: 'COMMANDER', role: 'commander', passwordHash: hashPassword(DEMO_PASSWORD) },
  { guardianId: 'GD-002', codename: 'DEFENDER1', role: 'defender', passwordHash: hashPassword(DEMO_PASSWORD) },
  { guardianId: 'GD-003', codename: 'DEFENDER2', role: 'defender', passwordHash: hashPassword(DEMO_PASSWORD) },
]

const glitchRows: (typeof glitches.$inferInsert)[] = [
  { glitchId: 'GL-0142', status: 'LEAKED', district: 'clockworks', siteId: 'clockworks:square', description: 'Time loop detected near the eastern clock tower', timestamp: '2026-11-10T13:42:00Z' },
  { glitchId: 'GL-0141', status: 'ASSESSING', district: 'mirewells', description: 'Magic reserves dropping faster than expected', timestamp: '2026-11-10T11:05:00Z' },
  { glitchId: 'GL-0140', status: 'LEAKED', district: 'greenhold', siteId: 'greenhold:square', description: 'Vines growing backwards into their seeds along the river', timestamp: '2026-11-10T09:20:00Z' },
  { glitchId: 'GL-0139', status: 'CONTAINING', district: 'archive', siteId: 'archive:station', description: 'Portal flicker in the archive vaults', timestamp: '2026-11-09T22:17:00Z' },
  { glitchId: 'GL-0138', status: 'ASSESSING', district: 'spire', description: 'Spire lanterns blinking the pattern from yesterday', timestamp: '2026-11-09T18:44:00Z' },
  { glitchId: 'GL-0137', status: 'FIXED', district: 'rustmarket', description: 'Echo sensors reporting duplicate signals', timestamp: '2026-11-08T08:30:00Z' },
  { glitchId: 'GL-0136', status: 'FIXED', district: 'ashfield', description: 'Ash falling upward over the old depot', timestamp: '2026-11-07T16:05:00Z' },
]

const echoRows: (typeof echoes.$inferInsert)[] = [
  { echoId: 'EC-0301', glitchId: 'GL-0142', description: 'Time loop detected near the eastern clock tower', timestamp: '2026-11-10T13:42:00Z', reportingGuardianId: 'GD-002' },
  { echoId: 'EC-0302', glitchId: 'GL-0142', description: 'Same minute keeps repeating at the tower gate, bells ring twice', timestamp: '2026-11-10T13:51:00Z', reportingGuardianId: 'GD-003' },
  { echoId: 'EC-0297', glitchId: 'GL-0141', description: 'Magic reserves dropping faster than expected', timestamp: '2026-11-10T11:05:00Z', reportingGuardianId: 'GD-003' },
  { echoId: 'EC-0295', glitchId: 'GL-0140', description: 'Vines growing backwards into their seeds along the river', timestamp: '2026-11-10T09:20:00Z', reportingGuardianId: 'GD-002' },
  { echoId: 'EC-0290', glitchId: 'GL-0139', description: 'Portal flicker in the archive vaults', timestamp: '2026-11-09T22:17:00Z', reportingGuardianId: 'GD-002' },
  { echoId: 'EC-0293', glitchId: 'GL-0139', description: 'Seal applied to vault door 3, flicker down to once per hour', timestamp: '2026-11-10T07:02:00Z', reportingGuardianId: 'GD-001' },
  { echoId: 'EC-0288', glitchId: 'GL-0138', description: 'Spire lanterns blinking the pattern from yesterday', timestamp: '2026-11-09T18:44:00Z', reportingGuardianId: 'GD-003' },
  { echoId: 'EC-0281', glitchId: 'GL-0137', description: 'Echo sensors reporting duplicate signals', timestamp: '2026-11-08T08:30:00Z', reportingGuardianId: 'GD-003' },
  { echoId: 'EC-0284', glitchId: 'GL-0137', description: 'Sensor array recalibrated, duplicates gone', timestamp: '2026-11-08T15:12:00Z', reportingGuardianId: 'GD-002' },
  { echoId: 'EC-0275', glitchId: 'GL-0136', description: 'Ash falling upward over the old depot', timestamp: '2026-11-07T16:05:00Z', reportingGuardianId: 'GD-002' },
  { echoId: 'EC-0278', glitchId: 'GL-0136', description: 'Rain came, ash settled. Depot quiet again', timestamp: '2026-11-08T06:40:00Z', reportingGuardianId: 'GD-001' },
]

// Operations are relative to now, so the demo always has fresh effects:
// one went off 3 hours ago (fires on the first page load), one is still pending.
const now = Date.now()
const minutes = (m: number) => new Date(now + m * 60_000).toISOString()
const operationRows: (typeof operations.$inferInsert)[] = [
  { operationId: 'OP-0001', district: 'rustmarket', siteId: 'rustmarket:square', type: 'sighting', coverStory: 'Residents report a figure walking backwards through Barter Ring', scheduledFor: minutes(-180), createdAt: minutes(-240), plannerId: 'GD-001', status: 'PLANNED' },
  { operationId: 'OP-0002', district: 'greenhold', siteId: 'greenhold:school', type: 'evacuation', coverStory: 'Evacuation sirens at Greenhold Commons School sounded with no operator present', scheduledFor: minutes(45), createdAt: minutes(-10), plannerId: 'GD-001', status: 'PLANNED' },
]

// Wipe and refill so the seed can be re-run safely.
db.transaction((tx) => {
  tx.delete(sessions).run()
  tx.delete(operations).run()
  tx.delete(echoes).run()
  tx.delete(glitches).run()
  tx.delete(guardians).run()
  tx.insert(guardians).values(guardianRows).run()
  tx.insert(glitches).values(glitchRows).run()
  tx.insert(echoes).values(echoRows).run()
  tx.insert(operations).values(operationRows).run()
})

console.log(
  `Seeded ${guardianRows.length} guardians, ${glitchRows.length} glitches, ${echoRows.length} echoes. Password for all: "${DEMO_PASSWORD}".`,
)
