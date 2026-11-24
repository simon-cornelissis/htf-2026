import { DISTRICT_IDS, DISTRICTS, parseSiteId, type DistrictId, type Mood, type SiteType } from './districts.ts'
import type { GlitchStatus } from './glitch.ts'

/**
 * False flag operations: incidents a commander stages and blames on the Desync.
 * When one goes off it becomes an ordinary-looking glitch for defenders,
 * and the district's residents get scared.
 */
export const OPERATION_TYPES = ['blackout', 'sighting', 'supply', 'evacuation', 'echoes'] as const

export type OperationType = (typeof OPERATION_TYPES)[number]

export const OPERATION_STATUSES = ['PLANNED', 'EXECUTED', 'CANCELLED'] as const

export type OperationStatus = (typeof OPERATION_STATUSES)[number]

export const OPERATION_META: Record<
  OperationType,
  { name: string; summary: string; effect: Mood; cover: (site: string) => string }
> = {
  blackout: {
    name: 'Staged blackout',
    summary: 'Cut the lights at the site and let people blame the Desync.',
    effect: { happiness: -12, fear: 10, anxiety: 22 },
    cover: (site) => `Lights died in sequence across ${site}, clocks stopped at the same second`,
  },
  sighting: {
    name: 'Fabricated sighting',
    summary: 'Plant witnesses who saw something that shouldn’t exist.',
    effect: { happiness: -8, fear: 28, anxiety: 12 },
    cover: (site) => `Residents report a figure walking backwards through ${site}`,
  },
  supply: {
    name: 'Supply scare',
    summary: 'Empty the shelves overnight. Hunger makes people nervous.',
    effect: { happiness: -16, fear: 6, anxiety: 24 },
    cover: (site) => `Shelves at ${site} emptied overnight, goods reappear a day old`,
  },
  evacuation: {
    name: 'False evacuation',
    summary: 'Sound the sirens with nobody at the controls.',
    effect: { happiness: -10, fear: 22, anxiety: 20 },
    cover: (site) => `Evacuation sirens at ${site} sounded with no operator present`,
  },
  echoes: {
    name: 'Planted echoes',
    summary: 'Replay old recordings until people doubt what day it is.',
    effect: { happiness: -6, fear: 12, anxiety: 16 },
    cover: (site) => `Voices from last week replaying in the halls of ${site}`,
  },
}

/** Crowded or vulnerable places amplify an operation. */
export const SITE_IMPACT: Record<SiteType, { factor: number; why: string }> = {
  station: { factor: 1.1, why: 'commuters carry the story across the city' },
  school: { factor: 1.3, why: 'parents panic, children repeat it' },
  hospital: { factor: 1.3, why: 'the vulnerable are easily frightened' },
  square: { factor: 1.2, why: 'crowds amplify rumours' },
  mall: { factor: 1.0, why: 'people shrug it off quickly' },
}

/** Full strength for the first hours, then fading out. */
export const EFFECT_FULL_HOURS = 2
export const EFFECT_FADE_HOURS = 48

export function operationIntensity(executedAt: string, now = Date.now()): number {
  const hours = (now - new Date(executedAt).getTime()) / 3_600_000
  if (hours < 0) return 0
  if (hours <= EFFECT_FULL_HOURS) return 1
  if (hours >= EFFECT_FADE_HOURS) return 0
  return 1 - (hours - EFFECT_FULL_HOURS) / (EFFECT_FADE_HOURS - EFFECT_FULL_HOURS)
}

/** How each open glitch weighs on residents, by status. */
const GLITCH_EFFECT: Record<GlitchStatus, Mood> = {
  LEAKED: { happiness: -6, fear: 5, anxiety: 8 },
  ASSESSING: { happiness: -4, fear: 3, anxiety: 5 },
  CONTAINING: { happiness: -2, fear: 1, anxiety: 2 },
  FIXED: { happiness: 0, fear: 0, anxiety: 0 },
}

export type MoodDriver = {
  /** What residents think caused it. Staged ones only reveal themselves to commanders. */
  label: string
  kind: 'glitch' | 'operation' | 'rumour'
  effect: Mood
}

export type DistrictMood = Mood & {
  district: DistrictId
  population: number
  drivers: MoodDriver[]
}

export type ExecutedOperation = {
  operationId: string
  district: DistrictId
  siteId: string
  type: OperationType
  scheduledFor: string
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/**
 * Mood per district = baseline + open glitches + fading operation effects.
 * With `revealOperations` false, operations show up as anonymous rumours.
 */
export function computeMoods(
  glitches: { district: DistrictId; status: GlitchStatus; glitchId: string }[],
  operations: ExecutedOperation[],
  revealOperations: boolean,
  now = Date.now(),
): Record<DistrictId, DistrictMood> {
  const out = {} as Record<DistrictId, DistrictMood>
  for (const id of DISTRICT_IDS) {
    const d = DISTRICTS[id]
    out[id] = { district: id, population: d.population, ...d.baseline, drivers: [] }
  }

  const add = (id: DistrictId, driver: MoodDriver) => {
    const m = out[id]
    m.happiness += driver.effect.happiness
    m.fear += driver.effect.fear
    m.anxiety += driver.effect.anxiety
    m.drivers.push(driver)
  }

  for (const g of glitches) {
    if (g.status === 'FIXED' || !out[g.district]) continue
    add(g.district, { label: `${g.glitchId} ${g.status.toLowerCase()}`, kind: 'glitch', effect: GLITCH_EFFECT[g.status] })
  }

  for (const op of operations) {
    const k = operationIntensity(op.scheduledFor, now)
    if (k <= 0 || !out[op.district]) continue
    const site = parseSiteId(op.siteId)
    const factor = site ? SITE_IMPACT[site.type].factor : 1
    const e = OPERATION_META[op.type].effect
    const effect = {
      happiness: e.happiness * k * factor,
      fear: e.fear * k * factor,
      anxiety: e.anxiety * k * factor,
    }
    if (revealOperations) {
      add(op.district, { label: `${op.operationId} ${OPERATION_META[op.type].name.toLowerCase()}`, kind: 'operation', effect })
      continue
    }
    // Defenders only see one combined, unexplained "rumours" driver per district.
    const m = out[op.district]
    const rumour = m.drivers.find((dr) => dr.kind === 'rumour')
    if (rumour) {
      rumour.effect = {
        happiness: rumour.effect.happiness + effect.happiness,
        fear: rumour.effect.fear + effect.fear,
        anxiety: rumour.effect.anxiety + effect.anxiety,
      }
      m.happiness += effect.happiness
      m.fear += effect.fear
      m.anxiety += effect.anxiety
    } else {
      add(op.district, { label: 'Rumours spreading', kind: 'rumour', effect })
    }
  }

  for (const id of DISTRICT_IDS) {
    const m = out[id]
    m.happiness = clamp(m.happiness)
    m.fear = clamp(m.fear)
    m.anxiety = clamp(m.anxiety)
  }
  return out
}

/** Overheard lines from residents, picked by how the district feels. */
const CHATTER: Record<'calm' | 'afraid' | 'anxious' | 'grim', string[]> = {
  calm: [
    'Market was busy today. Felt almost normal.',
    'Kids played in {square} until dark. Nobody worried.',
    'Trains ran on time from {station}. On time!',
    'Heard the guardians fixed something up north. Good.',
  ],
  afraid: [
    'I’m not letting my daughter walk past {school} anymore.',
    'Something is wrong at {station}. Everyone says so.',
    'They say it was the Desync. Who else could it be?',
    'Locked the door twice tonight. Then checked again.',
  ],
  anxious: [
    'Bought double rations at {mall}. Just in case.',
    'Can’t sleep. Keep thinking about what happened at {square}.',
    'Queue at {hospital} went round the block this morning.',
    'Nobody knows what’s next. That’s the worst part.',
  ],
  grim: [
    'People are packing up. Where would we even go?',
    'The guardians say it’s under control. It isn’t.',
    '{square} was empty at noon. Never seen that.',
    'My neighbour left last night. Didn’t say goodbye.',
  ],
}

export function chatterFor(district: DistrictId, mood: Mood, count = 3): string[] {
  const band =
    mood.fear >= 55 && mood.happiness < 40
      ? 'grim'
      : mood.fear >= 40
        ? 'afraid'
        : mood.anxiety >= 40
          ? 'anxious'
          : 'calm'
  const sites = DISTRICTS[district].sites
  const lines = CHATTER[band].map((l) => l.replace(/\{(\w+)\}/g, (_, k: SiteType) => sites[k] ?? k))
  // Rotate by district so neighbours don't all say the same thing.
  const offset = DISTRICT_IDS.indexOf(district)
  return Array.from({ length: Math.min(count, lines.length) }, (_, i) => lines[(i + offset) % lines.length])
}
