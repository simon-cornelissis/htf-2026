import { DISTRICT_IDS, DISTRICTS, parseSiteId, siteName, type DistrictId, type Mood, type SiteType } from './districts.ts'
import type { GlitchStatus } from './glitch.ts'
import type { BombOutcome } from './bomb.ts'

/**
 * False flag operations: incidents a commander stages and blames on the Desync.
 * When one goes off it becomes an ordinary-looking glitch for defenders,
 * and the district's residents get scared.
 */
export const OPERATION_TYPES = [
  'blackout',
  'sighting',
  'supply',
  'evacuation',
  'echoes',
  'bomb',
  'poison',
  'arson',
  'collapse',
  'gas',
  'riot',
  'surge',
  'vanish',
] as const

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
  bomb: {
    name: 'Planted device',
    summary: 'Hide a device at the site. When it goes off it arms a 3-minute fuse and every guardian is alerted. Whoever defuses it in time becomes a hero.',
    effect: { happiness: -10, fear: 24, anxiety: 26 },
    cover: (site) => `Unattended device ticking at ${site}, area cordoned off`,
  },
  poison: {
    name: 'Tainted wells',
    summary: 'Turn the water bad. People get sick and stop trusting the taps.',
    effect: { happiness: -18, fear: 20, anxiety: 30 },
    cover: (site) => `Water near ${site} runs grey and tastes of rust, people falling ill`,
  },
  arson: {
    name: 'Set a fire',
    summary: 'A blaze nobody can explain. The smoke hangs over the district for hours.',
    effect: { happiness: -14, fear: 26, anxiety: 18 },
    cover: (site) => `Fire broke out at ${site}, flames burned a colour nobody had seen before`,
  },
  collapse: {
    name: 'Structural collapse',
    summary: 'Weaken the old beams until part of the building comes down.',
    effect: { happiness: -16, fear: 30, anxiety: 22 },
    cover: (site) => `Part of ${site} folded in on itself, the rubble looks years old`,
  },
  gas: {
    name: 'Drifting fog',
    summary: 'Release a choking green fog. The wind carries it down the streets.',
    effect: { happiness: -12, fear: 32, anxiety: 26 },
    cover: (site) => `Green fog rolled out of ${site} and drifted with the wind, people coughing`,
  },
  riot: {
    name: 'Incited riot',
    summary: 'Plant agitators in the crowd and let anger do the rest.',
    effect: { happiness: -20, fear: 22, anxiety: 28 },
    cover: (site) => `Crowd at ${site} turned violent, witnesses say nobody knows who started it`,
  },
  surge: {
    name: 'Power surge',
    summary: 'Overload the grid. Lamps burst, wiring sparks, machines die at once.',
    effect: { happiness: -10, fear: 14, anxiety: 26 },
    cover: (site) => `Every lamp at ${site} burst at once, blue sparks crawled along the wires`,
  },
  vanish: {
    name: 'Disappearances',
    summary: 'People stop coming home. Everyone will say the Desync took them.',
    effect: { happiness: -14, fear: 34, anxiety: 24 },
    cover: (site) => `Residents last seen near ${site} never came home, their shadows still on the wall`,
  },
}

/** How an incident is drawn on the map. */
export const FX_KINDS = ['explosion', 'fire', 'gas', 'poison', 'collapse', 'crowd', 'flicker', 'surge', 'siren', 'echo', 'vanish', 'calm'] as const
export type FxKind = (typeof FX_KINDS)[number]

/**
 * Physical profile of each attack: what the public calls it, how it looks on
 * the map, and how much harm it does at a typical district (5,000 residents)
 * and a neutral site. `dead` / `injured` are [min, max]; `radius` is metres.
 */
export type ImpactProfile = {
  /** Public name. Never says it was staged. */
  label: string
  fx: FxKind
  dead: [number, number]
  injured: [number, number]
  radius: [number, number]
  /** For disappearances the count is people missing, not dead. */
  countWord: 'dead' | 'missing'
}

export const IMPACT: Record<OperationType, ImpactProfile> = {
  blackout: { label: 'Blackout', fx: 'flicker', dead: [0, 1], injured: [1, 6], radius: [180, 300], countWord: 'dead' },
  sighting: { label: 'Sighting', fx: 'echo', dead: [0, 0], injured: [0, 2], radius: [40, 80], countWord: 'dead' },
  supply: { label: 'Shortage', fx: 'crowd', dead: [0, 0], injured: [0, 5], radius: [60, 110], countWord: 'dead' },
  evacuation: { label: 'Siren alarm', fx: 'siren', dead: [0, 2], injured: [4, 16], radius: [200, 320], countWord: 'dead' },
  echoes: { label: 'Echoes', fx: 'echo', dead: [0, 0], injured: [0, 1], radius: [50, 90], countWord: 'dead' },
  // Applies when the device detonates. Defused: no harm at all.
  bomb: { label: 'Explosion', fx: 'explosion', dead: [6, 20], injured: [25, 70], radius: [100, 180], countWord: 'dead' },
  poison: { label: 'Poisoned water', fx: 'poison', dead: [1, 6], injured: [20, 60], radius: [180, 300], countWord: 'dead' },
  arson: { label: 'Fire', fx: 'fire', dead: [1, 5], injured: [6, 22], radius: [60, 120], countWord: 'dead' },
  collapse: { label: 'Collapse', fx: 'collapse', dead: [3, 12], injured: [10, 32], radius: [60, 120], countWord: 'dead' },
  gas: { label: 'Toxic fog', fx: 'gas', dead: [2, 8], injured: [15, 45], radius: [140, 260], countWord: 'dead' },
  riot: { label: 'Riot', fx: 'crowd', dead: [0, 3], injured: [12, 40], radius: [100, 180], countWord: 'dead' },
  surge: { label: 'Power surge', fx: 'surge', dead: [0, 2], injured: [3, 12], radius: [200, 340], countWord: 'dead' },
  vanish: { label: 'Disappearances', fx: 'vanish', dead: [2, 9], injured: [0, 0], radius: [80, 160], countWord: 'missing' },
}

/** A typical district, the one the IMPACT numbers are written for. */
const REFERENCE_POPULATION = 5000

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function seeded(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Impact = { casualties: number; injured: number; blastRadius: number }

/**
 * Harm done by one operation. Seeded by the operation id, so the same
 * operation always gives the same numbers. Bigger districts and crowded
 * sites mean more people in the way; the radius only depends on the site.
 */
export function computeImpact(operationId: string, type: OperationType, siteIdValue: string): Impact {
  const p = IMPACT[type]
  const crowd = crowdFactor(siteIdValue)
  const rand = seeded(hash(`${operationId}:${type}`))
  const pick = ([lo, hi]: [number, number]) => lo + rand() * (hi - lo)
  return {
    casualties: Math.round(pick(p.dead) * crowd),
    injured: Math.round(pick(p.injured) * crowd),
    blastRadius: Math.round(pick(p.radius) / 10) * 10,
  }
}

/** How many people are in the way at a site, relative to the reference district. */
function crowdFactor(siteIdValue: string) {
  const site = parseSiteId(siteIdValue)
  const population = site ? DISTRICTS[site.district].population : REFERENCE_POPULATION
  const factor = site ? SITE_IMPACT[site.type].factor : 1
  // Square root: a district twice the size doesn't put twice as many people on one corner.
  return Math.sqrt(population / REFERENCE_POPULATION) * factor
}

/** Expected range of harm at a site, for the planner. */
export function estimateImpact(type: OperationType, siteIdValue: string) {
  const p = IMPACT[type]
  const crowd = crowdFactor(siteIdValue)
  const scale = ([lo, hi]: [number, number]): [number, number] => [Math.round(lo * crowd), Math.round(hi * crowd)]
  return { dead: scale(p.dead), injured: scale(p.injured), radius: p.radius, countWord: p.countWord }
}

/** Extra fear from people getting hurt. Grows quickly at first, then levels off. */
export function harmEffect(casualties: number, injured: number): Mood {
  const fear = Math.min(18, 4 * Math.log2(1 + casualties) + 1.5 * Math.log2(1 + injured))
  return { happiness: -fear * 0.6, fear, anxiety: fear * 0.5 }
}

/** What happens to residents once a planted device is resolved. */
export const BOMB_OUTCOME_EFFECT: Record<BombOutcome, Mood> = {
  DETONATED: { happiness: -30, fear: 40, anxiety: 35 },
  DEFUSED: { happiness: 8, fear: -6, anxiety: -10 },
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
  /** Bombs only: set once defused or detonated. */
  outcome?: BombOutcome | null
  resolvedAt?: string | null
  /** Stored once it goes off; recomputed from the seed when missing. */
  casualties?: number | null
  injured?: number | null
}

/** Harm of an executed operation: stored numbers, or the seeded ones for older rows. */
export function harmOf(op: ExecutedOperation): { casualties: number; injured: number } {
  if (op.type === 'bomb' && op.outcome !== 'DETONATED') return { casualties: 0, injured: 0 }
  if (op.casualties != null && op.injured != null) return { casualties: op.casualties, injured: op.injured }
  const i = computeImpact(op.operationId, op.type, op.siteId)
  return { casualties: i.casualties, injured: i.injured }
}

const addMood = (a: Mood, b: Mood): Mood => ({
  happiness: a.happiness + b.happiness,
  fear: a.fear + b.fear,
  anxiety: a.anxiety + b.anxiety,
})

/** Attacks residents see with their own eyes, so they're named rather than rumoured. */
const PUBLIC_INCIDENTS = new Set<OperationType>(['poison', 'arson', 'collapse', 'gas', 'riot', 'surge', 'vanish'])

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
    // Resolved bombs swap their threat for the detonation (or relief) effect.
    const resolved = op.type === 'bomb' && op.outcome && op.resolvedAt
    const k = operationIntensity(resolved ? op.resolvedAt! : op.scheduledFor, now)
    if (k <= 0 || !out[op.district]) continue
    const site = parseSiteId(op.siteId)
    const factor = site ? SITE_IMPACT[site.type].factor : 1
    const harm = harmOf(op)
    // People getting hurt or going missing scares everyone, on top of the operation itself.
    // The body count already accounts for the site, so it isn't amplified again.
    const base = resolved ? BOMB_OUTCOME_EFFECT[op.outcome!] : OPERATION_META[op.type].effect
    const hurt = harmEffect(harm.casualties, harm.injured)
    const e = addMood(base, { happiness: hurt.happiness / factor, fear: hurt.fear / factor, anxiety: hurt.anxiety / factor })
    if (op.type === 'bomb') {
      // A bomb is public news: everyone sees it, only commanders see who planted it.
      const what = op.outcome === 'DETONATED' ? 'Device detonated' : op.outcome === 'DEFUSED' ? 'Device defused' : 'Armed device'
      add(op.district, {
        label: revealOperations ? `${op.operationId} ${what.toLowerCase()}` : what,
        kind: revealOperations ? 'operation' : 'glitch',
        effect: { happiness: e.happiness * k * factor, fear: e.fear * k * factor, anxiety: e.anxiety * k * factor },
      })
      continue
    }
    const effect = {
      happiness: e.happiness * k * factor,
      fear: e.fear * k * factor,
      anxiety: e.anxiety * k * factor,
    }
    if (revealOperations) {
      add(op.district, { label: `${op.operationId} ${OPERATION_META[op.type].name.toLowerCase()}`, kind: 'operation', effect })
      continue
    }
    // Physical incidents (fires, fog, collapses...) are public news under their public name.
    if (PUBLIC_INCIDENTS.has(op.type)) {
      const where = siteName(op.siteId)
      add(op.district, { label: where ? `${IMPACT[op.type].label} at ${where}` : IMPACT[op.type].label, kind: 'glitch', effect })
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
