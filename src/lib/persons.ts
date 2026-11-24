import type { DistrictId } from './districts.ts'

/**
 * People of interest: the Desync network, as the agency files them.
 *
 * Officially they are a terror cell behind the glitches. In truth they are
 * journalists and insiders trying to expose the Meridian cover-up. The static
 * profile lives here; status, heat and case entries live in the database
 * (created lazily by ensurePersons() in world.ts).
 *
 * Client code may import the types and small helpers from this file, but must
 * never import PERSONS: it holds classified truth lines. Server functions send
 * each viewer only what their clearance allows.
 */

export const PERSON_STATUSES = ['AT_LARGE', 'WANTED', 'DETAINED', 'ERASED'] as const
export type PersonStatus = (typeof PERSON_STATUSES)[number]

export const CASE_KINDS = ['INTERCEPT', 'SIGHTING', 'ATTRIBUTION', 'NOTE', 'ACTION', 'LEAK'] as const
export type CaseKind = (typeof CASE_KINDS)[number]

export const PERSON_STATUS_META: Record<PersonStatus, { label: string; hint: string; lamp: 'red' | 'amber' | 'green' | undefined }> = {
  AT_LARGE: { label: 'At large', hint: 'Whereabouts unknown. Under observation.', lamp: 'amber' },
  WANTED: { label: 'Wanted', hint: 'Warrant issued. Every post is looking for them.', lamp: 'red' },
  DETAINED: { label: 'Detained', hint: 'In agency custody.', lamp: 'green' },
  ERASED: { label: 'Erased', hint: 'Record withdrawn by order of the Guardians.', lamp: undefined },
}

export const CASE_KIND_META: Record<CaseKind, { label: string; hint: string }> = {
  INTERCEPT: { label: 'Intercept', hint: 'A message or broadcast the agency picked up.' },
  SIGHTING: { label: 'Sighting', hint: 'Someone saw them somewhere.' },
  ATTRIBUTION: { label: 'Attribution', hint: 'The agency holds them responsible for an incident.' },
  NOTE: { label: 'Agency note', hint: 'Written by a commander.' },
  ACTION: { label: 'Action', hint: 'A warrant, detention or other order.' },
  LEAK: { label: 'Leak', hint: 'Desync material that reached the public.' },
}

/** Heat at which a warrant is issued automatically. */
export const WANTED_HEAT = 50
/** Heat added by every attack pinned on someone, before the harm bonus. */
export const ATTRIBUTION_HEAT = 20

export type SeedEntry = { kind: CaseKind; body: string; classified?: boolean; hoursAgo: number }

export type Person = {
  personId: string
  /** Codename the agency files them under. Always public. */
  alias: string
  realName: string
  /** Only commanders see the real name. */
  realNameClassified: boolean
  /** Their part in the Desync, in the agency's voice. */
  role: string
  district: DistrictId
  /** Official profile: the agency line every guardian reads. */
  profile: string
  /** Classified truth. Commanders and admins only. */
  truth: string
  /**
   * How much they add to the exposure meter while free (0–8): publishers and
   * insiders weigh most.
   */
  exposureWeight: number
  start: { status: PersonStatus; heat: number }
  seed: SeedEntry[]
}

export const PERSONS: Person[] = [
  {
    personId: 'PI-01',
    alias: 'INKWELL',
    realName: 'Mara Vey',
    realNameClassified: false,
    role: 'Editor of the underground paper “The Unwound Clock”',
    district: 'rustmarket',
    profile:
      'Runs a stolen hand press under the Long Stalls. Prints alarmist pamphlets that blame the Guardians for the glitches. Known agitator. Do not engage in debate.',
    truth:
      'Her reporting on the Ashfield depot is accurate. She holds two Meridian shipping manifests and is looking for a third.',
    exposureWeight: 6,
    start: { status: 'AT_LARGE', heat: 35 },
    seed: [
      { kind: 'INTERCEPT', hoursAgo: 90, body: 'Note left at a Rustmarket drop: “Press runs Thursday. Bring paper, not names.”' },
      { kind: 'SIGHTING', hoursAgo: 40, body: 'Seen buying lamp oil at the Long Stalls. Paid in old council coin.' },
      { kind: 'NOTE', hoursAgo: 39, classified: true, body: 'Do not detain yet. She leads us to her sources.' },
    ],
  },
  {
    personId: 'PI-02',
    alias: 'STATIC',
    realName: 'Joss Harrow',
    realNameClassified: false,
    role: 'Host of the pirate radio show “Night Frequency”',
    district: 'mirewells',
    profile:
      'Broadcasts from a moving transmitter in the marsh. Reads Desync propaganda between old records. Listening is discouraged; reporting the frequency is rewarded.',
    truth:
      'His map of “backwards vines” matches our own Lodestar residue spread chart to within forty metres.',
    exposureWeight: 6,
    start: { status: 'AT_LARGE', heat: 40 },
    seed: [
      { kind: 'INTERCEPT', hoursAgo: 72, body: 'Broadcast, 02:10: “If the vines grow backwards in your street, write it down. Dates. Places. They are counting on you forgetting.”' },
      { kind: 'SIGHTING', hoursAgo: 20, body: 'Transmitter van reported near Lantern Square. Gone before the patrol arrived.' },
    ],
  },
  {
    personId: 'PI-03',
    alias: 'CINDER',
    realName: 'Dr. Ilse Marrow',
    realNameClassified: true,
    role: 'Defector. Former technician of a decommissioned state facility',
    district: 'ashfield',
    profile:
      'Former agency contractor who walked off her post with restricted property. Mentally unstable, prone to fantasy. Considered the Desync’s most dangerous voice.',
    truth:
      'Containment technician at Meridian Laboratory, shift B. Witnessed the K-7 “Lodestar” breach 412 days ago. Believed to carry a residue sample. Priority: silence.',
    exposureWeight: 8,
    start: { status: 'WANTED', heat: 85 },
    seed: [
      { kind: 'ACTION', hoursAgo: 96, body: 'Warrant issued. Approach with caution.' },
      { kind: 'SIGHTING', hoursAgo: 60, body: 'A woman matching the description was seen at Field Hospital 3, asking about burns that heal backwards.' },
      { kind: 'INTERCEPT', hoursAgo: 30, classified: true, body: 'Encrypted burst to STATIC: “Sample is stable. They moved the rest deeper. I can prove it.”' },
    ],
  },
  {
    personId: 'PI-04',
    alias: 'LEDGER',
    realName: 'Tobias Quell',
    realNameClassified: false,
    role: 'Council archivist, suspected of copying sealed records',
    district: 'archive',
    profile:
      'Junior archivist at the Archive Vaults. Logged out of the sealed stacks at odd hours on eleven occasions. Quiet, polite, unremarkable. Watch the unremarkable ones.',
    truth:
      'He has found the sealed council minute that authorised the transfer of comet fragment K-7 to Meridian. He has not copied it yet.',
    exposureWeight: 5,
    start: { status: 'AT_LARGE', heat: 15 },
    seed: [
      { kind: 'SIGHTING', hoursAgo: 80, body: 'Left the Vault Line Terminus carrying a satchel heavier than on arrival.' },
      { kind: 'INTERCEPT', hoursAgo: 12, body: 'Library request slip: “Council minutes, year of the comet, sealed shelf 9.” Request denied.' },
    ],
  },
  {
    personId: 'PI-05',
    alias: 'SPOKE',
    realName: 'Wren Talley',
    realNameClassified: false,
    role: 'Bicycle courier, moves messages between cells',
    district: 'oldreach',
    profile:
      'Carries parcels across the broken bridges for anyone who pays. Caught twice with Desync leaflets. Claims she never reads what she carries.',
    truth: 'She is telling the truth. She knows nothing about Lodestar. Useful as an example.',
    exposureWeight: 2,
    start: { status: 'DETAINED', heat: 0 },
    seed: [
      { kind: 'SIGHTING', hoursAgo: 70, body: 'Stopped at Broken Bridge Halt with forty copies of “The Unwound Clock”.' },
      { kind: 'ACTION', hoursAgo: 69, body: 'Detained for questioning.' },
    ],
  },
  {
    personId: 'PI-06',
    alias: 'CHALK',
    realName: 'Edda Brisk',
    realNameClassified: false,
    role: 'Schoolteacher, hands out leaflets to parents',
    district: 'greenhold',
    profile:
      'Teacher at Greenhold Commons School. Has her pupils draw “what the glitches look like” and pins the drawings outside. Spreads fear among children.',
    truth: 'The drawings show ash falling upward over Ashfield. The children draw what they see.',
    exposureWeight: 2,
    start: { status: 'AT_LARGE', heat: 10 },
    seed: [
      { kind: 'SIGHTING', hoursAgo: 50, body: 'Pinned children’s drawings on the fence of Fountain Square. Removed by the morning patrol.' },
      { kind: 'INTERCEPT', hoursAgo: 8, body: 'Leaflet: “Ask your guardian where the comet went.”' },
    ],
  },
  {
    personId: 'PI-07',
    alias: 'MAINSPRING',
    realName: 'Corin Ashby',
    realNameClassified: false,
    role: 'Engineer at the Clockworks, falsified drift readings',
    district: 'clockworks',
    profile:
      'Senior gear engineer. Published “clock drift” numbers without clearance and claims the drift points toward a single source. Suspended pending review.',
    truth: 'He measured the temporal drift radiating from Ashfield. His numbers are correct to the second.',
    exposureWeight: 4,
    start: { status: 'AT_LARGE', heat: 25 },
    seed: [
      { kind: 'INTERCEPT', hoursAgo: 66, body: 'Letter to a colleague: “Every clock in the city is late by the same amount per mile from the old depot. That is not a coincidence.”' },
      { kind: 'NOTE', hoursAgo: 65, classified: true, body: 'Readings confiscated. Replace the Clockworks drift log with the corrected copy.' },
    ],
  },
  {
    personId: 'PI-08',
    alias: 'NULLBYTE',
    realName: 'Unidentified',
    realNameClassified: true,
    role: 'Intruder in the grid uplink, identity unknown',
    district: 'spire',
    profile:
      'Anonymous handle seen in the grid relay logs. Has defaced public terminals with the word “REMEMBER”. Possibly several people.',
    truth:
      'Has read access to this terminal’s relay logs. Assume CUSTODIAN traffic is compromised. Suspected council staff in the Spire.',
    exposureWeight: 5,
    start: { status: 'WANTED', heat: 70 },
    seed: [
      { kind: 'INTERCEPT', hoursAgo: 84, body: 'Message on every public terminal in Oath Square for nine seconds: “REMEMBER DAY ONE.”' },
      { kind: 'ACTION', hoursAgo: 83, body: 'Warrant issued for the person or persons behind the handle.' },
      { kind: 'INTERCEPT', hoursAgo: 4, classified: true, body: 'Relay log shows a read of the Meridian shipping index from a Spire terminal. Terminal wiped.' },
    ],
  },
]

export function personById(id: string | null | undefined): Person | undefined {
  return id ? PERSONS.find((p) => p.personId === id) : undefined
}

/** Still out there and able to publish. */
export const isFree = (s: PersonStatus) => s === 'AT_LARGE' || s === 'WANTED'

export const isPersonStatus = (v: unknown): v is PersonStatus => PERSON_STATUSES.includes(v as PersonStatus)

// --- Exposure: how close the Desync is to exposing the Meridian cover-up ---

/** One step every this many hours since the first file was opened. */
export const EXPOSURE_DRIFT_HOURS = 6
export const EXPOSURE_DRIFT_CAP = 30
/** Each attack pinned on someone still free: they publish a denial. */
export const EXPOSURE_PER_DENIAL = 4
export const EXPOSURE_DETAINED = -4
export const EXPOSURE_ERASED = -6

export type ExposureInput = {
  persons: { personId: string; status: PersonStatus }[]
  /** Attributions per person id. */
  attributions: Record<string, number>
  /** ISO 8601 of the earliest case entry. */
  since: string | null
}

export function computeExposure({ persons, attributions, since }: ExposureInput, now = Date.now()): number {
  const hours = since ? Math.max(0, (now - new Date(since).getTime()) / 3_600_000) : 0
  let total = Math.min(EXPOSURE_DRIFT_CAP, Math.floor(hours / EXPOSURE_DRIFT_HOURS))
  for (const row of persons) {
    const p = personById(row.personId)
    if (!p) continue
    if (row.status === 'AT_LARGE') total += p.exposureWeight
    else if (row.status === 'WANTED') total += p.exposureWeight / 2 // in hiding, publishing less
    else if (row.status === 'DETAINED') total += EXPOSURE_DETAINED
    else total += EXPOSURE_ERASED
    if (isFree(row.status)) total += (attributions[row.personId] ?? 0) * EXPOSURE_PER_DENIAL
  }
  return Math.max(0, Math.min(100, Math.round(total)))
}

export function exposureTier(n: number): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (n >= 100) return { label: 'Breached', tone: 'red' }
  if (n >= 75) return { label: 'Critical', tone: 'red' }
  if (n >= 50) return { label: 'Spreading', tone: 'amber' }
  if (n >= 25) return { label: 'Rumours', tone: 'amber' }
  return { label: 'Contained', tone: 'green' }
}

/** What residents feel, shown to everyone below commander. Moves with exposure, but says nothing about why. */
export const publicTrust = (exposure: number) => Math.max(0, Math.min(100, Math.round(88 - exposure * 0.6)))

/**
 * Leaks fire once each, the first time exposure reaches the threshold.
 * `by` is the preferred publisher; if they're no longer free, the freest
 * heavyweight left publishes it instead.
 */
export const LEAKS: { at: number; by: string; body: string; echo: string; note: string }[] = [
  {
    at: 25,
    by: 'PI-02',
    body: 'Pirate broadcast on the Night Frequency claims a laboratory called “Meridian” exists beneath the Ashfield depot.',
    echo: 'Residents report a pirate broadcast on every kitchen radio: a laboratory called “Meridian” is said to lie under the old Ashfield depot. Guardians call it Desync disinformation.',
    note: 'The name is out. Deny the facility. Have the Ashfield depot listed as derelict in the public registry.',
  },
  {
    at: 50,
    by: 'PI-01',
    body: '“The Unwound Clock” prints a shipping manifest: crate K-7, “astronomical sample”, delivered to the Ashfield depot 412 days ago.',
    echo: 'Copies of “The Unwound Clock” found in three districts. It prints what it calls a shipping manifest for a crate marked K-7. The Guardians say it is forged.',
    note: 'The manifest is genuine. Trace the copy. Recall every depot ledger from that month.',
  },
  {
    at: 75,
    by: 'PI-03',
    body: 'A recorded testimony circulates: a former technician describes a containment breach and a “residue” that makes time run wrong.',
    echo: 'A recording passes from hand to hand: a woman says she worked under Ashfield and saw “the stone from the sky” leak. Guardians urge residents to hand in the recordings.',
    note: 'Voice match: CINDER. Her account is accurate in every detail. Find her before the next broadcast.',
  },
  {
    at: 100,
    by: 'PI-04',
    body: 'Sealed council minutes authorising the transfer of “Lodestar” to Meridian are pasted on the walls of Oath Square.',
    echo: 'Pages pasted all over Oath Square at dawn, stamped with the council seal. People are reading them aloud. Guardians are tearing them down.',
    note: 'Cover-up integrity lost. The minute is real. Contain the square, then the story.',
  },
]

// --- What a case file looks like on the wire ---

export type CaseEntryView = {
  id: number
  kind: CaseKind
  /** null when classified and the viewer isn't cleared. */
  body: string | null
  /** For redaction bars of a believable length. */
  length: number
  classified: boolean
  glitchId: string | null
  /** Commanders only. */
  operationId?: string | null
  authorCodename: string | null
  timestamp: string
}

export type PersonCard = {
  personId: string
  /** null when the record was erased and the viewer isn't cleared. */
  alias: string | null
  /** null when classified for this viewer. */
  realName: string | null
  role: string | null
  district: DistrictId
  status: PersonStatus
  heat: number
  entryCount: number
  lastEntryAt: string | null
}

export type PersonFile = PersonCard & {
  profile: string | null
  /** Commanders only. */
  truth?: string
  entries: CaseEntryView[]
  /** How many attacks the agency pinned on them. */
  attributions: number
}

/** A suspect named on a glitch or incident. */
export type Suspect = { personId: string; alias: string | null; status: PersonStatus }

/** Redaction bar text for a classified string of this length. */
export function redact(length: number, max = 48): string {
  return '█'.repeat(Math.max(4, Math.min(max, Math.round(length * 0.6))))
}
