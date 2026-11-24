import type { DistrictId } from './districts.ts'
import { EFFECT_FADE_HOURS, operationIntensity, type FxKind } from './operations.ts'
import type { Suspect } from './persons.ts'

/**
 * A public incident: something that happened in a district, as residents and
 * guardians saw it. Built from executed operations and from real glitches
 * alike, and nothing in here tells them apart: only commanders get the
 * operation id.
 */
export type Incident = {
  /** Stable key for lists and highlighting. */
  key: string
  glitchId: string | null
  /** Commanders only. */
  operationId?: string
  district: DistrictId
  siteId: string
  siteName: string
  /** ISO 8601. When it happened (for a detonation: when it went off). */
  at: string
  /** Public name, e.g. "Fire". */
  label: string
  fx: FxKind
  casualties: number
  injured: number
  /** Metres. 0 when nothing was harmed. */
  radius: number
  /** "dead", or "missing" for disappearances. */
  countWord: 'dead' | 'missing'
  /** Person of interest the agency holds responsible, if any. */
  suspect?: Suspect | null
}

/** How far back the history goes. */
export const HISTORY_DAYS = 7
export const HISTORY_LIMIT = 60

/** Fresh: the big one-off animation (blast, collapse dust) plays. */
export const FX_FRESH_MS = 3 * 60_000
/** Hot: flames, fog, crowds are still going. */
export const FX_HOT_MS = 6 * 3_600_000
/** Smoky: smoke and stains linger. After this only a residue mark is left. */
export const FX_SMOKE_MS = 24 * 3_600_000
/** Gone from the map, still in the history. */
export const FX_GONE_MS = EFFECT_FADE_HOURS * 3_600_000

export type FxPhase = {
  age: number
  /** 1 → 0 over two days, the same curve as the mood effect. */
  intensity: number
  fresh: boolean
  hot: boolean
  smoky: boolean
  visible: boolean
}

export function fxPhase(at: string, now: number): FxPhase {
  const age = Math.max(0, now - new Date(at).getTime())
  return {
    age,
    intensity: operationIntensity(at, now),
    fresh: age < FX_FRESH_MS,
    hot: age < FX_HOT_MS,
    smoky: age < FX_SMOKE_MS,
    visible: age < FX_GONE_MS,
  }
}

/** "3 dead · 12 hurt", or "4 missing", or "No one hurt". */
export function harmLine(i: Pick<Incident, 'casualties' | 'injured' | 'countWord'>): string {
  const parts: string[] = []
  if (i.casualties > 0) parts.push(`${i.casualties} ${i.countWord}`)
  if (i.injured > 0) parts.push(`${i.injured} hurt`)
  return parts.length ? parts.join(' · ') : 'No one hurt'
}

export type IncidentTotals = { count: number; casualties: number; missing: number; injured: number }

/** Totals over incidents in the last 24 hours. */
export function totalsToday(list: Incident[], now: number): IncidentTotals {
  const since = now - 24 * 3_600_000
  const t: IncidentTotals = { count: 0, casualties: 0, missing: 0, injured: 0 }
  for (const i of list) {
    if (new Date(i.at).getTime() < since) continue
    t.count++
    if (i.countWord === 'missing') t.missing += i.casualties
    else t.casualties += i.casualties
    t.injured += i.injured
  }
  return t
}
