import type { DistrictId } from './districts.ts'

/** Lifecycle of a glitch, in order. */
export const GLITCH_STATUSES = [
  'LEAKED',
  'ASSESSING',
  'CONTAINING',
  'FIXED',
] as const

export type GlitchStatus = (typeof GLITCH_STATUSES)[number]

/**
 * guardian: read-only (follow glitches, search, ask the chatbot).
 * defender: reports echoes and defuses devices.
 * commander: defender + status changes, deletes, assignments, operations.
 * admin: commander + overrides on AI decisions and moderation escalations.
 */
export const GUARDIAN_ROLES = ['guardian', 'defender', 'commander', 'admin'] as const

export type GuardianRole = (typeof GUARDIAN_ROLES)[number]

export const ROLE_LABEL: Record<GuardianRole, string> = {
  guardian: 'Guardian',
  defender: 'Defender',
  commander: 'Commander',
  admin: 'Admin',
}

/** Commander powers: status, deletes, assignments, operations. Admins have them too. */
export const canCommand = (role: GuardianRole) => role === 'commander' || role === 'admin'

/** May post echoes and defuse devices. Everyone except read-only guardians. */
export const canReport = (role: GuardianRole) => role !== 'guardian'

export type Glitch = {
  glitchId: string
  status: GlitchStatus
  district: DistrictId
  /** Optional landmark, e.g. "clockworks:station". */
  siteId: string | null
  description: string
  /** ISO 8601 */
  timestamp: string
}

/** A glitch as shown in lists: with how many echoes were reported for it. */
export type GlitchSummary = Glitch & {
  echoCount: number
  lastEchoAt: string | null
  /** Operation id when this glitch was staged. Only ever sent to commanders. */
  stagedBy?: string | null
}

export type Guardian = {
  guardianId: string
  codename: string
  role: GuardianRole
}

export type Echo = {
  echoId: string
  glitchId: string
  description: string
  /** ISO 8601 */
  timestamp: string
  reportingGuardianId: string
  reportingCodename: string
}

export type GlitchDetail = Glitch & { echoes: Echo[]; stagedBy?: string | null }

/** Display copy per status. The UI never relies on colour alone. */
export const STATUS_META: Record<
  GlitchStatus,
  { label: string; hint: string; tone: 'blood' | 'gold' | 'bone' | 'ash' }
> = {
  LEAKED: { label: 'Leaked', hint: 'Reported, nobody on it yet', tone: 'blood' },
  ASSESSING: { label: 'Assessing', hint: 'Being investigated', tone: 'gold' },
  CONTAINING: { label: 'Containing', hint: 'Fix in progress', tone: 'bone' },
  FIXED: { label: 'Fixed', hint: 'Continuity restored', tone: 'ash' },
}

/**
 * How intact Achrona's continuity is, 0–100. Every open glitch drains it;
 * the earlier in its lifecycle, the more it drains.
 */
export function continuityIndex(glitches: Pick<Glitch, 'status'>[]): number {
  const drain: Record<GlitchStatus, number> = {
    LEAKED: 9,
    ASSESSING: 6,
    CONTAINING: 3,
    FIXED: 0,
  }
  const total = glitches.reduce((sum, g) => sum + drain[g.status], 0)
  return Math.max(0, 100 - total)
}
