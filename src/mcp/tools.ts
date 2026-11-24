// Server-only. The one tool registry of Achrona's AI layer: the MCP server
// (src/mcp/server.ts) and CUSTODIAN, the in-app chat assistant (src/chat/**),
// both expose exactly these tools. Every tool is a thin wrapper around an
// existing server function, run as the calling guardian (runAs), so the app's
// own role checks decide what an agent may do.
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getActiveBombs, getBomb, getRecentBlasts, cutWire } from '#/lib/bombs.functions.ts'
import { getIncidents } from '#/lib/incidents.functions.ts'
import { DISTRICT_IDS, DISTRICTS, SITE_META, SITE_TYPES, siteId } from '#/lib/districts.ts'
import {
  canCommand,
  canReport,
  continuityIndex,
  GLITCH_STATUSES,
  ROLE_LABEL,
  STATUS_META,
  type Guardian,
  type GuardianRole,
  type GlitchSummary,
} from '#/lib/glitch.ts'
import { getGlitch, getGlitches, reportEcho, setGlitchStatus } from '#/lib/glitches.functions.ts'
import { getLeaderboard, SCORING } from '#/lib/leaderboard.functions.ts'
import { EFFECT_FADE_HOURS, EFFECT_FULL_HOURS, IMPACT, OPERATION_META, OPERATION_TYPES, SITE_IMPACT } from '#/lib/operations.ts'
import { cancelOperation, getDistrict, getMoods, planOperation, type Operation } from '#/lib/operations.functions.ts'
import { FUSE_SECONDS, MAX_STRIKES, STRIKE_PENALTY_SECONDS } from '#/lib/bomb.ts'
import { actOnPerson, addCaseNote, attributeGlitch, getExposure, getPerson, getPersons, PERSON_ACTIONS } from '#/lib/persons.functions.ts'
import { PERSON_STATUS_META, PERSON_STATUSES, type PersonCard } from '#/lib/persons.ts'
import { runAs } from '#/lib/session.ts'
import { getSensorStatus, ingestSensorReading } from '#/lib/sensors.functions.ts'
import { capabilitiesFor } from './capabilities.ts'
import { resolveDistrict, resolveSite, siteLabel } from './world-lookup.ts'

/** Who may see and call a tool. */
export type ToolAccess = 'everyone' | 'reporter' | 'commander'

/**
 * What calling it does to the world. CUSTODIAN runs `read` tools on its own
 * and stops for the operator's approval before any `write` or `attack`
 * (attacks additionally need hold-to-confirm in the UI).
 */
export type ToolEffect = 'read' | 'write' | 'attack'

export type ToolResult = { text: string; isError?: boolean }

export interface ToolDef<S extends z.ZodObject = z.ZodObject> {
  name: string
  title: string
  description: string
  input: S
  access: ToolAccess
  effect: ToolEffect
  annotations: ToolAnnotations
  /** Per-call override of `effect` (e.g. erasing a person needs attack-level confirmation). */
  effectFor?(input: z.infer<S>): ToolEffect
  /** One plain-language line for approval cards ("Stage a Supply scare at Barter Ring, in 5 minutes"). Must not throw. */
  summarize?(input: z.infer<S>): string
  run(input: z.infer<S>, caller: Guardian): Promise<ToolResult>
}

const defineTool = <S extends z.ZodObject>(def: ToolDef<S>): ToolDef<S> => def

type Json = Record<string, unknown> | unknown[]

const ok = (summary: string, data?: Json): ToolResult => ({
  text: data === undefined ? summary : `${summary}\n\n${JSON.stringify(data, null, 2)}`,
})

const fail = (message: string): ToolResult => ({ isError: true, text: message })

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

/**
 * A glitch as the model sees it: names next to ids. Any extra fields the server
 * function returns (e.g. AI triage data) pass through unchanged, already
 * filtered for the caller's role by the server function itself.
 */
const glitchView = (g: GlitchSummary) => {
  const { timestamp, stagedBy, ...rest } = g
  return {
    ...rest,
    districtName: DISTRICTS[g.district]?.name ?? g.district,
    site: siteLabel(g.siteId),
    reportedAt: timestamp,
    ...(stagedBy !== undefined ? { stagedByOperation: stagedBy } : {}),
  }
}

const operationView = (o: Operation) => ({
  operationId: o.operationId,
  type: o.type,
  typeName: OPERATION_META[o.type]?.name ?? o.type,
  status: o.status,
  siteId: o.siteId,
  site: siteLabel(o.siteId),
  coverStory: o.coverStory,
  scheduledFor: o.scheduledFor,
  createdAt: o.createdAt,
  glitchId: o.glitchId,
  planner: o.plannerCodename,
  pinnedOn: o.pinnedOn,
})

const glitchIdSchema = z.string().regex(/^GL-\d+$/, 'A glitch id looks like "GL-0137" (capital GL).')

/** Resolve a site for display, never throwing (summaries run before validation of names). */
function siteName(input: string | undefined): string | undefined {
  if (!input) return undefined
  try {
    const s = resolveSite(input)
    return `${s.name} (${DISTRICTS[s.district].name})`
  } catch {
    return `"${input}" (unresolved)`
  }
}

function districtName(input: string | undefined): string | undefined {
  if (!input) return undefined
  try {
    return DISTRICTS[resolveDistrict(input)].name
  } catch {
    return `"${input}" (unresolved)`
  }
}

const personIdSchema = z.string().min(1).max(80).describe('Person id like "PI-03", or their alias (see list_persons).')

/**
 * A person from an id or an alias. Aliases are matched against what the
 * caller may see (getPersons is filtered by role), so this never reveals more.
 */
async function resolvePerson(input: string): Promise<PersonCard> {
  const people = await getPersons()
  const q = input.trim().toLowerCase()
  const hit = people.find((p) => p.personId.toLowerCase() === q) ?? people.find((p) => p.alias?.toLowerCase() === q)
  if (!hit) throw new Error(`No person of interest "${input}". Use list_persons to find the id.`)
  return hit
}

const quote = (s: string, max = 160) => `"${s.length > max ? `${s.slice(0, max - 1)}…` : s}"`

// ── Everyone ───────────────────────────────────────────────────────────────

const whoami = defineTool({
  name: 'whoami',
  title: 'Who am I',
  description: 'Shows which guardian this connection acts as, their role, and what that role allows. Call this first if unsure what you may do.',
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run(_input, caller) {
    return ok(`You are ${caller.codename} (${caller.guardianId}), role ${ROLE_LABEL[caller.role]}.`, {
      guardianId: caller.guardianId,
      codename: caller.codename,
      role: caller.role,
      canReportEchoes: canReport(caller.role),
      canDefuseDevices: canReport(caller.role),
      canCommand: canCommand(caller.role),
      capabilities: capabilitiesFor(caller.role),
    })
  },
})

const listGlitches = defineTool({
  name: 'list_glitches',
  title: 'List and search glitches',
  description:
    'Lists glitches (incidents) on the board, newest first, with filters. Use `query` for free-text search in descriptions and ids. ' +
    'Statuses: LEAKED (nobody on it), ASSESSING, CONTAINING, FIXED. For commanders each glitch also shows `stagedByOperation` when it was a false flag.',
  input: z.strictObject({
    status: z.array(z.enum(GLITCH_STATUSES)).min(1).optional().describe('Only these statuses, e.g. ["LEAKED","ASSESSING"].'),
    openOnly: z.boolean().optional().describe('Shortcut: everything except FIXED.'),
    district: z.string().optional().describe('District id or name, e.g. "rustmarket" or "Old Reach".'),
    site: z.string().optional().describe('Site id ("oldreach:station") or landmark name ("Broken Bridge Halt").'),
    query: z.string().max(200).optional().describe('Case-insensitive text to find in the description or glitch id.'),
    limit: z.number().int().min(1).max(200).optional().describe('Max results, default 50.'),
  }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run(args) {
    const district = args.district ? resolveDistrict(args.district) : undefined
    const site = args.site ? resolveSite(args.site) : undefined
    const q = args.query?.trim().toLowerCase()
    const all = await getGlitches()
    const hits = all.filter(
      (g) =>
        (!args.status || args.status.includes(g.status)) &&
        (!args.openOnly || g.status !== 'FIXED') &&
        (!district || g.district === district) &&
        (!site || g.siteId === site.siteId) &&
        (!q || g.description.toLowerCase().includes(q) || g.glitchId.toLowerCase().includes(q)),
    )
    const limit = args.limit ?? 50
    return ok(`${hits.length} of ${all.length} glitches match${hits.length > limit ? `, showing the newest ${limit}` : ''}.`, hits.slice(0, limit).map(glitchView))
  },
})

const getGlitchTool = defineTool({
  name: 'get_glitch',
  title: 'Get a glitch file',
  description: 'Full file of one glitch: status, district, site and every echo (sighting report) in order, with who reported it.',
  input: z.strictObject({ glitchId: glitchIdSchema.describe('e.g. "GL-0137"') }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run({ glitchId }) {
    const g = await getGlitch({ data: glitchId })
    if (!g) return fail(`There is no glitch ${glitchId}. Use list_glitches to find the right id.`)
    return ok(`${g.glitchId} · ${STATUS_META[g.status].label} (${STATUS_META[g.status].hint}).`, {
      ...glitchView({ ...g, echoCount: g.echoes.length, lastEchoAt: g.echoes.at(-1)?.timestamp ?? null }),
      echoes: g.echoes.map((e) => ({ echoId: e.echoId, at: e.timestamp, by: e.reportingCodename, description: e.description })),
    })
  },
})

const getWorld = defineTool({
  name: 'get_world',
  title: 'World state',
  description:
    'Overview of Achrona right now: grid integrity (continuity index 0-100, 100 = intact), open glitches, armed devices, and per district ' +
    'the residents\' happiness, fear and anxiety (0-100) with what drives them. Districts are sorted by fear, most afraid first. ' +
    'Defenders see staged operations only as anonymous "rumours"; commanders see the operation ids.',
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run() {
    const [moods, glitches, bombs] = await Promise.all([getMoods(), getGlitches(), getActiveBombs()])
    const open = glitches.filter((g) => g.status !== 'FIXED')
    const districts = DISTRICT_IDS.map((id) => {
      const m = moods[id]
      return {
        district: id,
        name: DISTRICTS[id].name,
        population: m.population,
        happiness: m.happiness,
        fear: m.fear,
        anxiety: m.anxiety,
        openGlitches: open.filter((g) => g.district === id).length,
        drivers: m.drivers.map((d) => ({
          label: d.label,
          kind: d.kind,
          effect: { happiness: Math.round(d.effect.happiness), fear: Math.round(d.effect.fear), anxiety: Math.round(d.effect.anxiety) },
        })),
      }
    }).sort((a, b) => b.fear - a.fear || b.anxiety - a.anxiety)
    const integrity = continuityIndex(glitches)
    return ok(
      `Grid integrity ${integrity}/100. ${open.length} open glitches, ${bombs.length} armed device(s). Most afraid: ${districts[0].name} (fear ${districts[0].fear}).`,
      {
        gridIntegrity: integrity,
        openGlitches: open.length,
        openByStatus: Object.fromEntries(GLITCH_STATUSES.map((s) => [s, glitches.filter((g) => g.status === s).length])),
        armedDevices: bombs.map((b) => ({ glitchId: b.glitchId, site: b.siteName, fuseEndsAt: b.fuseEndsAt })),
        districts,
      },
    )
  },
})

const listDistricts = defineTool({
  name: 'list_districts',
  title: 'Districts and landmarks',
  description: 'Every district of Achrona with its lore, population and its five landmarks (site ids and names). Use the site ids in other tools.',
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run() {
    return ok(
      `${DISTRICT_IDS.length} districts, ${SITE_TYPES.length} landmarks each.`,
      DISTRICT_IDS.map((id) => ({
        district: id,
        name: DISTRICTS[id].name,
        lore: DISTRICTS[id].lore,
        population: DISTRICTS[id].population,
        sites: SITE_TYPES.map((t) => ({ siteId: siteId(id, t), name: DISTRICTS[id].sites[t], type: SITE_META[t].label })),
      })),
    )
  },
})

const getDistrictTool = defineTool({
  name: 'get_district',
  title: 'District intel',
  description:
    'Intel on one district: residents\' mood and what drives it, overheard chatter, open glitches there, and its landmarks. ' +
    'Commanders also get the district\'s operations log (planned, executed and cancelled false flags).',
  input: z.strictObject({ district: z.string().describe('District id or name, e.g. "greenhold" or "Mire Wells".') }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run({ district }) {
    const id = resolveDistrict(district)
    const [intel, glitches] = await Promise.all([getDistrict({ data: id }), getGlitches()])
    const d = DISTRICTS[id]
    return ok(`${d.name}: happiness ${intel.mood.happiness}, fear ${intel.mood.fear}, anxiety ${intel.mood.anxiety}.`, {
      district: id,
      name: d.name,
      lore: d.lore,
      population: d.population,
      mood: { happiness: intel.mood.happiness, fear: intel.mood.fear, anxiety: intel.mood.anxiety },
      drivers: intel.mood.drivers,
      chatter: intel.chatter,
      sites: SITE_TYPES.map((t) => ({ siteId: siteId(id, t), name: d.sites[t], type: SITE_META[t].label, hint: SITE_META[t].hint })),
      openGlitches: glitches.filter((g) => g.district === id && g.status !== 'FIXED').map(glitchView),
      ...(intel.operations ? { operations: intel.operations.map(operationView) } : {}),
    })
  },
})

const listActiveBombs = defineTool({
  name: 'list_active_bombs',
  title: 'Armed devices',
  description: `Planted devices that are ticking right now, with their site and when the fuse runs out. A fuse lasts ${FUSE_SECONDS} seconds from arming.`,
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run() {
    const [bombs, blasts] = await Promise.all([getActiveBombs(), getRecentBlasts()])
    const now = Date.now()
    const armed = bombs.map((b) => ({ ...b, secondsLeft: Math.max(0, Math.round((new Date(b.fuseEndsAt).getTime() - now) / 1000)) }))
    const summary = armed.length === 0 ? 'No armed devices right now.' : `${armed.length} armed device(s): act fast, use get_bomb then cut_wire.`
    return ok(`${summary}${blasts.length ? ` ${blasts.length} recent detonation(s).` : ''}`, { armed, recentDetonations: blasts })
  },
})

const listIncidents = defineTool({
  name: 'list_incidents',
  title: 'Incident history',
  description:
    'What happened where over the last week, newest first: blackouts, fires, explosions, disappearances and so on, with casualties, injured ' +
    'and radius in metres. Commanders also see which operation caused each one.',
  input: z.strictObject({ district: z.string().optional().describe('District id or name. Leave out for all districts.') }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run(args) {
    const district = args.district ? resolveDistrict(args.district) : undefined
    const incidents = await getIncidents({ data: { district } })
    const dead = incidents.reduce((s, i) => s + (i.countWord === 'dead' ? i.casualties : 0), 0)
    return ok(`${incidents.length} incident(s) in the last week${district ? ` in ${DISTRICTS[district].name}` : ''}, ${dead} dead in total.`, incidents)
  },
})

const getBombTool = defineTool({
  name: 'get_bomb',
  title: 'Inspect a device',
  description:
    'One planted device (by the glitch id of its file): status, seconds left, the wires from left to right (index 0 = leftmost) and the defusal manual. ' +
    `Follow the manual step by step: the step to do next is manual[cut.length]. Wrong cuts are strikes (${MAX_STRIKES} = boom) and burn ${STRIKE_PENALTY_SECONDS}s of fuse.`,
  input: z.strictObject({ glitchId: glitchIdSchema.describe('Glitch id of the device, from list_active_bombs.') }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run({ glitchId }) {
    const b = await getBomb({ data: glitchId })
    if (!b) return fail(`${glitchId} is not a planted device. Use list_active_bombs.`)
    const secondsLeft = Math.max(0, Math.round((new Date(b.fuseEndsAt).getTime() - Date.now()) / 1000))
    return ok(`Device at ${b.siteName}: ${b.status}${b.status === 'ARMED' ? `, ${secondsLeft}s left` : ''}.`, {
      glitchId: b.glitchId,
      status: b.status,
      site: b.siteName,
      district: b.district,
      secondsLeft: b.status === 'ARMED' ? secondsLeft : 0,
      wires: b.puzzle.wires.map((color, index) => ({ index, color, cut: b.puzzle.cut.includes(index) })),
      manual: b.puzzle.manual,
      nextStep: b.status === 'ARMED' ? (b.puzzle.manual[b.puzzle.cut.length] ?? null) : null,
      cut: b.puzzle.cut,
      strikes: b.puzzle.strikes,
      maxStrikes: MAX_STRIKES,
      defusedBy: b.defusedByCodename,
      defusePoints: b.defusePoints,
      ...(b.status === 'DETONATED' ? { casualties: b.casualties, injured: b.injured, blastRadius: b.blastRadius } : {}),
    })
  },
})

const getLeaderboardTool = defineTool({
  name: 'get_leaderboard',
  title: 'Leaderboard',
  description: 'Defenders ranked by points, with their badges, and how points are earned.',
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run() {
    const rows = await getLeaderboard()
    return ok(`${rows.length} defenders ranked.`, {
      scoring: Object.values(SCORING),
      rankings: rows.map((r) => ({ ...r, badges: r.badges.map((b) => b.label) })),
    })
  },
})


const listPersons = defineTool({
  name: 'list_persons',
  title: 'Persons of interest',
  description:
    'The persons of interest index: suspected Desync members with alias, district, status (AT_LARGE, WANTED, DETAINED, ERASED), heat ' +
    '(how hot their trail is) and how many case entries they have. Filter by status or district.',
  input: z.strictObject({
    status: z.enum(PERSON_STATUSES).optional().describe('Only this status.'),
    district: z.string().optional().describe('District id or name.'),
  }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run(args) {
    const district = args.district ? resolveDistrict(args.district) : undefined
    const all = await getPersons()
    const hits = all.filter((p) => (!args.status || p.status === args.status) && (!district || p.district === district))
    return ok(
      `${hits.length} of ${all.length} persons of interest.`,
      hits.map((p) => ({ ...p, districtName: DISTRICTS[p.district]?.name ?? p.district, statusHint: PERSON_STATUS_META[p.status].hint })),
    )
  },
})

const getPersonTool = defineTool({
  name: 'get_person',
  title: 'Case file',
  description: "One person of interest's case file: profile, status, and every case entry (intercepts, sightings, attributions, notes, actions) in order.",
  input: z.strictObject({ person: personIdSchema }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run({ person }) {
    const { personId } = await resolvePerson(person)
    const file = await getPerson({ data: personId })
    if (!file) return fail(`No case file for ${person}.`)
    return ok(`${file.personId} · ${file.alias ?? '[record withdrawn]'} · ${PERSON_STATUS_META[file.status].label}.`, file)
  },
})

const getExposureTool = defineTool({
  name: 'get_exposure',
  title: 'Exposure',
  description:
    'How the agency stands with the public. Commanders get the cover-up integrity reading (exposure and tier); everyone else gets the public trust figure (0-100).',
  input: z.strictObject({}),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run() {
    const e = await getExposure()
    return ok(e.clearance === 'command' ? `Exposure ${e.exposure} (${e.tier}).` : `Public trust ${e.trust}/100.`, e)
  },
})

const getSensorStatusTool = defineTool({
  name: 'get_sensor_status',
  title: 'Sensor trends',
  description:
    'Read the latest sensor readings from the last 24 hours and open sensor-generated anomalies. ' +
    'data_stock and magic_reserve trigger an automatic LEAKED glitch when a sensor reports a drop of at least 40% within five minutes.',
  input: z.strictObject({
    district: z.string().optional().describe('Optional district id or name to filter sensor readings.'),
  }),
  access: 'everyone',
  effect: 'read',
  annotations: READ,
  async run({ district }) {
    const status = await getSensorStatus({ data: { district: district ? resolveDistrict(district) : undefined } })
    return ok(
      `${status.readings.length} sensor readings in the last 24 hours; ${status.openAnomalies.length} open sensor anomalies.`,
      status,
    )
  },
})

// ── Defenders and up ───────────────────────────────────────────────────────

const ingestSensorReadingTool = defineTool({
  name: 'ingest_sensor_reading',
  title: 'Ingest sensor reading',
  description:
    'Record a trusted IoT sensor reading. This can automatically open a severity-4 LEAKED glitch when data_stock or ' +
    'magic_reserve drops by at least 40% within five minutes. Call only with a real reading supplied by a sensor; never invent telemetry.',
  input: z.strictObject({
    sensorId: z.string().min(1).max(64).describe('Provisioned sensor id, e.g. "mirewells-store-01".'),
    district: z.string().describe('District id or name.'),
    metric: z.enum(['data_stock', 'magic_reserve']).describe('Monitored resource metric.'),
    value: z.number().finite().min(0).max(1e12).describe('Current non-negative sensor value.'),
  }),
  access: 'commander',
  effect: 'write',
  annotations: WRITE,
  summarize({ sensorId, district, metric, value }) {
    return `Record ${metric} reading ${value} from ${sensorId} in ${district}.`
  },
  async run({ sensorId, district, metric, value }) {
    const result = await ingestSensorReading({
      data: { sensorId, district: resolveDistrict(district), metric, value },
    })
    if (!result.anomaly) return ok(`Sensor reading stored. No threshold breach detected.`, result)
    if (!result.anomaly.created) {
      return ok(`Anomaly remains linked to open glitch ${result.anomaly.glitchId}; no duplicate was opened.`, result)
    }
    return ok(`Predictive anomaly detected. Opened ${result.anomaly.glitchId} (LEAKED, severity 4).`, result)
  },
})

const reportEchoTool = defineTool({
  name: 'report_echo',
  title: 'Report an echo',
  description:
    'Report a sighting. Without glitchId it opens a NEW glitch (status LEAKED) in a district, optionally at a landmark. ' +
    'With glitchId it adds an update to that existing glitch. Before opening a new one, check list_glitches for a matching open glitch.',
  input: z.strictObject({
    description: z.string().min(3).max(500).describe('What was seen, in plain words (3-500 characters).'),
    glitchId: glitchIdSchema.optional().describe('Existing glitch to update. Leave out to open a new glitch.'),
    district: z.string().optional().describe('District id or name. Needed for a new glitch unless `site` is given.'),
    site: z.string().optional().describe('Optional landmark: site id ("clockworks:station") or name ("Clockworks Central").'),
  }),
  access: 'reporter',
  effect: 'write',
  annotations: WRITE,
  summarize(args) {
    const where = siteName(args.site) ?? districtName(args.district)
    const target = args.glitchId ? `Add an echo to ${args.glitchId}` : 'Open a NEW glitch (LEAKED)'
    return `${target}${where ? ` at ${where}` : ''}: ${quote(args.description)}`
  },
  async run(args) {
    const site = args.site ? resolveSite(args.site) : undefined
    const district = args.district ? resolveDistrict(args.district) : site?.district
    if (site && district && site.district !== district) {
      return fail(`${site.name} is in ${DISTRICTS[site.district].name}, not ${DISTRICTS[district].name}.`)
    }
    if (!args.glitchId && !district) return fail('Say where it happened: give `district` or `site` for a new glitch.')
    const res = await reportEcho({ data: { description: args.description, glitchId: args.glitchId, district, siteId: site?.siteId } })
    return ok(args.glitchId ? `Echo ${res.echoId} added to ${res.glitchId}.` : `New glitch ${res.glitchId} opened (LEAKED) with echo ${res.echoId}.`, res)
  },
})

const cutWireTool = defineTool({
  name: 'cut_wire',
  title: 'Cut a wire',
  description:
    'Cut one wire on an armed device to defuse it. `wire` is the 0-based index from the left, as listed by get_bomb. ' +
    'Read get_bomb first and follow manual[cut.length]. A correct cut advances the manual; the last correct cut defuses it and earns hero points. ' +
    `A wrong cut is a strike and burns ${STRIKE_PENALTY_SECONDS}s; ${MAX_STRIKES} strikes and it detonates. Cannot be undone.`,
  input: z.strictObject({
    glitchId: glitchIdSchema.describe('Glitch id of the device.'),
    wire: z.number().int().min(0).max(9).describe('0-based wire index from the left.'),
  }),
  access: 'reporter',
  effect: 'write',
  annotations: { ...WRITE, destructiveHint: true },
  summarize({ glitchId, wire }) {
    return `Cut wire ${wire} (${ordinal(wire + 1)} from the left) on device ${glitchId}. Cannot be undone.`
  },
  async run({ glitchId, wire }, caller) {
    const { result, state } = await cutWire({ data: { glitchId, wire } })
    const secondsLeft = Math.max(0, Math.round((new Date(state.fuseEndsAt).getTime() - Date.now()) / 1000))
    const say: Record<typeof result, string> = {
      correct: `Correct. ${state.puzzle.manual.length - state.puzzle.cut.length} step(s) to go. Next: ${state.puzzle.manual[state.puzzle.cut.length] ?? '-'}`,
      wrong: `Wrong wire. Strike ${state.puzzle.strikes}/${MAX_STRIKES}, fuse burnt down to ${secondsLeft}s.`,
      defused: `DEFUSED. ${state.defusePoints ?? 0} hero points for ${caller.codename}.`,
      detonated: 'The device detonated.',
      'already-resolved': `Too late: this device is already ${state.status.toLowerCase()}.`,
    }
    return ok(say[result], {
      result,
      status: state.status,
      secondsLeft,
      cut: state.puzzle.cut,
      strikes: state.puzzle.strikes,
      nextStep: state.status === 'ARMED' ? (state.puzzle.manual[state.puzzle.cut.length] ?? null) : null,
    })
  },
})

const range = ([lo, hi]: readonly [number, number]) => (lo === hi ? `${lo}` : `${lo}-${hi}`)

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

// ── Commanders and admins ──────────────────────────────────────────────────

const setGlitchStatusTool = defineTool({
  name: 'set_glitch_status',
  title: 'Change glitch status',
  description: 'Move a glitch through its lifecycle: LEAKED -> ASSESSING -> CONTAINING -> FIXED (any status may be set). Fixed glitches stop draining grid integrity and calm residents.',
  input: z.strictObject({ glitchId: glitchIdSchema, status: z.enum(GLITCH_STATUSES) }),
  access: 'commander',
  effect: 'write',
  annotations: { ...WRITE, idempotentHint: true },
  summarize({ glitchId, status }) {
    return `Set ${glitchId} to ${status} (${STATUS_META[status].hint}).`
  },
  async run({ glitchId, status }) {
    const before = await getGlitch({ data: glitchId })
    if (!before) return fail(`There is no glitch ${glitchId}. Use list_glitches to find the right id.`)
    await setGlitchStatus({ data: { glitchId, status } })
    return ok(`${glitchId}: ${before.status} -> ${status}.`, { glitchId, from: before.status, to: status })
  },
})

const listOperationTypes = defineTool({
  name: 'list_operation_types',
  title: 'Operation types',
  description:
    'The kinds of false flag operation a commander can stage, with their effect on residents\' mood (happiness/fear/anxiety deltas), ' +
    'how each site type amplifies it, and how long effects last.',
  input: z.strictObject({}),
  access: 'commander',
  effect: 'read',
  annotations: READ,
  async run() {
    return ok(`${OPERATION_TYPES.length} operation types.`, {
      types: OPERATION_TYPES.map((t) => ({
        type: t,
        name: OPERATION_META[t].name,
        summary: OPERATION_META[t].summary,
        effect: OPERATION_META[t].effect,
        exampleCoverStory: OPERATION_META[t].cover('<site>'),
        publicName: IMPACT[t].label,
        harm: { dead: IMPACT[t].dead, injured: IMPACT[t].injured, radiusMetres: IMPACT[t].radius, countWord: IMPACT[t].countWord },
      })),
      siteAmplifiers: SITE_IMPACT,
      effectDuration: `Full strength for ${EFFECT_FULL_HOURS}h, then fades out until ${EFFECT_FADE_HOURS}h.`,
      planting: `A "bomb" arms a ${FUSE_SECONDS}s fuse when it goes off and alerts every guardian; defenders race to defuse it.`,
    })
  },
})

const planOperationTool = defineTool({
  name: 'plan_operation',
  title: 'Plan a false flag operation',
  description:
    'Stage a fake incident at a landmark (the "attack on the world"). When it goes off it appears to defenders as an ordinary LEAKED glitch ' +
    'carrying the cover story, and the district\'s residents get scared. delayMinutes 0 = goes off immediately; max 1440 (24h). ' +
    'Planned operations can be cancelled with cancel_operation until they go off. See list_operation_types for types and effects.',
  input: z.strictObject({
    site: z.string().describe('Site id ("rustmarket:square") or landmark name ("Barter Ring").'),
    type: z.enum(OPERATION_TYPES).describe('Operation type, see list_operation_types.'),
    delayMinutes: z.number().int().min(0).max(1440).describe('Minutes from now until it goes off. 0 = now.'),
    coverStory: z.string().max(300).optional().describe('What defenders will read. Leave out for a fitting default.'),
    pinnedOn: personIdSchema.optional().describe('Optional person of interest to blame it on (id or alias); it lands in their case file.'),
  }),
  access: 'commander',
  effect: 'attack',
  annotations: WRITE,
  summarize(args) {
    const when = args.delayMinutes === 0 ? 'immediately' : `in ${args.delayMinutes} minute(s)`
    const harm = IMPACT[args.type]
    const cover = args.coverStory ? ` Cover story: ${quote(args.coverStory)}.` : ' Default cover story.'
    return (
      `Stage a ${OPERATION_META[args.type]?.name ?? args.type} at ${siteName(args.site)}, going off ${when}.` +
      `${args.pinnedOn ? ` Blamed on ${args.pinnedOn}.` : ''}` +
      `${cover} Expected harm: ${harm ? `${range(harm.dead)} ${harm.countWord}, ${range(harm.injured)} injured` : 'unknown'}. Can be cancelled until it goes off.`
    )
  },
  async run(args) {
    const site = resolveSite(args.site)
    const pinnedOn = args.pinnedOn ? (await resolvePerson(args.pinnedOn)).personId : undefined
    const { operationId } = await planOperation({
      data: { siteId: site.siteId, type: args.type, delayMinutes: args.delayMinutes, coverStory: args.coverStory, pinnedOn },
    })
    const intel = await getDistrict({ data: site.district })
    const op = intel.operations?.find((o) => o.operationId === operationId)
    const when = args.delayMinutes === 0 ? 'now' : `in ${args.delayMinutes} minute(s)`
    return ok(`${operationId} planned: ${OPERATION_META[args.type].name} at ${site.name}, goes off ${when}.`, {
      ...(op ? operationView(op) : { operationId, siteId: site.siteId }),
      expectedEffect: OPERATION_META[args.type].effect,
      siteAmplifier: SITE_IMPACT[site.type],
    })
  },
})

const cancelOperationTool = defineTool({
  name: 'cancel_operation',
  title: 'Cancel an operation',
  description: 'Call off a PLANNED operation before it goes off. Operations that already went off cannot be undone.',
  input: z.strictObject({
    operationId: z.string().regex(/^OP-\d+$/, 'An operation id looks like "OP-0004" (capital OP).'),
  }),
  access: 'commander',
  effect: 'write',
  annotations: { ...WRITE, idempotentHint: true },
  summarize({ operationId }) {
    return `Call off ${operationId} before it goes off.`
  },
  async run({ operationId }) {
    await cancelOperation({ data: operationId })
    return ok(`${operationId} cancelled.`)
  },
})

const listOperations = defineTool({
  name: 'list_operations',
  title: 'Operations log',
  description: 'All false flag operations across every district, newest first. Filter by status (PLANNED, EXECUTED, CANCELLED) or district.',
  input: z.strictObject({
    status: z.enum(['PLANNED', 'EXECUTED', 'CANCELLED']).optional(),
    district: z.string().optional().describe('District id or name.'),
  }),
  access: 'commander',
  effect: 'read',
  annotations: READ,
  async run(args) {
    const ids = args.district ? [resolveDistrict(args.district)] : [...DISTRICT_IDS]
    const logs = await Promise.all(ids.map((id) => getDistrict({ data: id })))
    const ops = logs
      .flatMap((l) => l.operations ?? [])
      .filter((o) => !args.status || o.status === args.status)
      .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
    return ok(`${ops.length} operation(s).`, ops.map(operationView))
  },
})


const actOnPersonTool = defineTool({
  name: 'act_on_person',
  title: 'Order on a person',
  description:
    'Commander orders on a person of interest: "warrant" (AT_LARGE -> WANTED), "detain" (AT_LARGE or WANTED -> DETAINED) or "erase" ' +
    '(withdraw the record entirely; cannot be undone).',
  input: z.strictObject({
    person: personIdSchema,
    action: z.enum(PERSON_ACTIONS).describe('warrant, detain or erase.'),
  }),
  access: 'commander',
  effect: 'write',
  annotations: { ...WRITE, destructiveHint: true },
  effectFor: ({ action }) => (action === 'erase' ? 'attack' : 'write'),
  summarize({ person, action }) {
    const what = { warrant: 'Issue a warrant for', detain: 'Detain', erase: 'ERASE the record of' }[action]
    return `${what} ${person}.${action === 'erase' ? ' This cannot be undone.' : ''}`
  },
  async run({ person, action }) {
    const p = await resolvePerson(person)
    await actOnPerson({ data: { personId: p.personId, action } })
    const after = await getPerson({ data: p.personId })
    return ok(`${p.personId} (${p.alias ?? 'withdrawn'}): ${action} done, now ${after?.status ?? 'unknown'}.`, {
      personId: p.personId,
      action,
      status: after?.status ?? null,
    })
  },
})

const addCaseNoteTool = defineTool({
  name: 'add_case_note',
  title: 'Add a case note',
  description: "Add a note to a person's case file. classified=true hides the text from everyone below commander.",
  input: z.strictObject({
    person: personIdSchema,
    body: z.string().min(3).max(400).describe('The note, 3-400 characters.'),
    classified: z.boolean().optional().describe('Hide the text below command level. Default false.'),
  }),
  access: 'commander',
  effect: 'write',
  annotations: WRITE,
  summarize({ person, body, classified }) {
    return `Add a ${classified ? 'CLASSIFIED ' : ''}note to the file of ${person}: ${quote(body)}`
  },
  async run({ person, body, classified }) {
    const p = await resolvePerson(person)
    await addCaseNote({ data: { personId: p.personId, body, classified } })
    return ok(`Note added to ${p.personId}${classified ? ' (classified)' : ''}.`)
  },
})

const attributeGlitchTool = defineTool({
  name: 'attribute_glitch',
  title: 'Pin a glitch on a person',
  description:
    'Officially attribute a glitch (staged or not) to a person of interest: it lands in their case file and raises their heat. ' +
    'A glitch can be attributed once; erased persons cannot be blamed.',
  input: z.strictObject({ glitchId: glitchIdSchema, person: personIdSchema }),
  access: 'commander',
  effect: 'write',
  annotations: WRITE,
  summarize({ glitchId, person }) {
    return `Pin ${glitchId} on ${person} in the official record.`
  },
  async run({ glitchId, person }) {
    const p = await resolvePerson(person)
    await attributeGlitch({ data: { glitchId, personId: p.personId } })
    return ok(`${glitchId} attributed to ${p.personId} (${p.alias ?? 'withdrawn'}).`)
  },
})

/** Every tool, in the order clients list them. */
export const TOOLS: readonly ToolDef[] = [
  whoami,
  listGlitches,
  getGlitchTool,
  getWorld,
  listDistricts,
  getDistrictTool,
  listActiveBombs,
  listIncidents,
  getBombTool,
  getLeaderboardTool,
  listPersons,
  getPersonTool,
  getExposureTool,
  getSensorStatusTool,
  reportEchoTool,
  cutWireTool,
  setGlitchStatusTool,
  listOperationTypes,
  planOperationTool,
  cancelOperationTool,
  listOperations,
  actOnPersonTool,
  addCaseNoteTool,
  attributeGlitchTool,
  ingestSensorReadingTool,
] as readonly ToolDef[]

export function roleAllows(access: ToolAccess, role: GuardianRole): boolean {
  return access === 'everyone' || (access === 'reporter' ? canReport(role) : canCommand(role))
}

/** The tools a role may see and call, in listing order. */
export function toolsForRole(role: GuardianRole): ToolDef[] {
  return TOOLS.filter((t) => roleAllows(t.access, role))
}

/** Look a tool up by name, but only among those the role may use. */
export function findTool(name: string, role: GuardianRole): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name && roleAllows(t.access, role))
}

/** The effect of one specific call (some tools escalate by input). */
export function effectOf(def: ToolDef, input: unknown): ToolEffect {
  try {
    return def.effectFor?.(input as never) ?? def.effect
  } catch {
    return def.effect
  }
}

/** Plain-language summary for an approval card; falls back to the tool title. */
export function summarizeCall(def: ToolDef, input: unknown): string {
  try {
    return def.summarize?.(input as never) ?? `${def.title}.`
  } catch {
    return `${def.title}.`
  }
}

/**
 * Validate and run a tool as the caller. Thrown errors become tool errors the
 * model can read and recover from; the server functions' own role checks still
 * apply because everything runs inside runAs(caller).
 */
export function executeTool(def: ToolDef, input: unknown, caller: Guardian): Promise<ToolResult> {
  return runAs(caller, async () => {
    if (!roleAllows(def.access, caller.role)) return fail(`${def.name} is not available to a ${ROLE_LABEL[caller.role]}.`)
    const parsed = def.input.safeParse(input ?? {})
    if (!parsed.success) return fail(`Invalid arguments for ${def.name}: ${z.prettifyError(parsed.error)}`)
    try {
      return await def.run(parsed.data, caller)
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Something went wrong on the terminal.')
    }
  })
}
