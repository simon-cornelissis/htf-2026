// Server-only. The MCP face of Achrona: every tool is a thin wrapper around an
// existing server function, run as the guardian who owns the access token, so
// the app's own role checks decide what an MCP client may do.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
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
  type GlitchSummary,
} from '#/lib/glitch.ts'
import { getGlitch, getGlitches, reportEcho, setGlitchStatus } from '#/lib/glitches.functions.ts'
import { getLeaderboard, SCORING } from '#/lib/leaderboard.functions.ts'
import { EFFECT_FADE_HOURS, EFFECT_FULL_HOURS, IMPACT, OPERATION_META, OPERATION_TYPES, SITE_IMPACT } from '#/lib/operations.ts'
import { cancelOperation, getDistrict, getMoods, planOperation, type Operation } from '#/lib/operations.functions.ts'
import { FUSE_SECONDS, MAX_STRIKES, STRIKE_PENALTY_SECONDS } from '#/lib/bomb.ts'
import { runAs } from '#/lib/session.ts'
import { capabilitiesFor } from './capabilities.ts'
import { resolveDistrict, resolveSite, siteLabel } from './world-lookup.ts'

const INSTRUCTIONS = `You are connected to the Guardians of the Grid terminal of Achrona, a fictional realm whose
continuity is threatened by "glitches". Everything here is a game world. You act as the signed-in guardian
and have exactly their permissions.

Vocabulary: a glitch is an incident (status LEAKED -> ASSESSING -> CONTAINING -> FIXED); an echo is a sighting
report on a glitch; districts have residents whose happiness, fear and anxiety (0-100) react to glitches.
Commanders can stage "false flag operations" that look like real glitches to defenders. A planted device
(operation type "bomb") arms a ${FUSE_SECONDS}-second fuse: anyone with defender rights can defuse it with cut_wire.

Sites are landmarks: use a site id "district:type" (e.g. "rustmarket:square") or the landmark name.
Call list_districts when unsure. Deleting glitches or echoes is not available here: that stays with humans in the app.`

type Json = Record<string, unknown> | unknown[]

const ok = (summary: string, data?: Json): CallToolResult => ({
  content: [{ type: 'text', text: data === undefined ? summary : `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
})

const fail = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] })

/** Run a tool body as the caller; turn thrown errors into tool errors the model can read and recover from. */
function as(caller: Guardian, body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  return runAs(caller, async () => {
    try {
      return await body()
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Something went wrong on the terminal.')
    }
  })
}

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
})

const glitchIdSchema = z.string().regex(/^GL-\d+$/, 'A glitch id looks like "GL-0137" (capital GL).')

/** A fresh server per request (stateless), with only the tools this guardian's role may use. */
export function createAchronaMcpServer(caller: Guardian): McpServer {
  const server = new McpServer(
    { name: 'achrona-guardians-of-the-grid', title: 'Guardians of the Grid · Achrona', version: '1.0.0' },
    { instructions: INSTRUCTIONS, capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  const isReporter = canReport(caller.role)
  const isCommander = canCommand(caller.role)

  // ── Everyone ─────────────────────────────────────────────────────────────

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Shows which guardian this connection acts as, their role, and what that role allows. Call this first if unsure what you may do.',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    () =>
      as(caller, async () =>
        ok(`You are ${caller.codename} (${caller.guardianId}), role ${ROLE_LABEL[caller.role]}.`, {
          guardianId: caller.guardianId,
          codename: caller.codename,
          role: caller.role,
          canReportEchoes: isReporter,
          canDefuseDevices: isReporter,
          canCommand: isCommander,
          capabilities: capabilitiesFor(caller.role),
        }),
      ),
  )

  server.registerTool(
    'list_glitches',
    {
      title: 'List and search glitches',
      description:
        'Lists glitches (incidents) on the board, newest first, with filters. Use `query` for free-text search in descriptions and ids. ' +
        'Statuses: LEAKED (nobody on it), ASSESSING, CONTAINING, FIXED. For commanders each glitch also shows `stagedByOperation` when it was a false flag.',
      inputSchema: z.strictObject({
        status: z.array(z.enum(GLITCH_STATUSES)).min(1).optional().describe('Only these statuses, e.g. ["LEAKED","ASSESSING"].'),
        openOnly: z.boolean().optional().describe('Shortcut: everything except FIXED.'),
        district: z.string().optional().describe('District id or name, e.g. "rustmarket" or "Old Reach".'),
        site: z.string().optional().describe('Site id ("oldreach:station") or landmark name ("Broken Bridge Halt").'),
        query: z.string().max(200).optional().describe('Case-insensitive text to find in the description or glitch id.'),
        limit: z.number().int().min(1).max(200).optional().describe('Max results, default 50.'),
      }),
      annotations: READ,
    },
    (args) =>
      as(caller, async () => {
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
      }),
  )

  server.registerTool(
    'get_glitch',
    {
      title: 'Get a glitch file',
      description: 'Full file of one glitch: status, district, site and every echo (sighting report) in order, with who reported it.',
      inputSchema: z.strictObject({ glitchId: glitchIdSchema.describe('e.g. "GL-0137"') }),
      annotations: READ,
    },
    ({ glitchId }) =>
      as(caller, async () => {
        const g = await getGlitch({ data: glitchId })
        if (!g) return fail(`There is no glitch ${glitchId}. Use list_glitches to find the right id.`)
        return ok(`${g.glitchId} · ${STATUS_META[g.status].label} (${STATUS_META[g.status].hint}).`, {
          ...glitchView({ ...g, echoCount: g.echoes.length, lastEchoAt: g.echoes.at(-1)?.timestamp ?? null }),
          echoes: g.echoes.map((e) => ({ echoId: e.echoId, at: e.timestamp, by: e.reportingCodename, description: e.description })),
        })
      }),
  )

  server.registerTool(
    'get_world',
    {
      title: 'World state',
      description:
        'Overview of Achrona right now: grid integrity (continuity index 0-100, 100 = intact), open glitches, armed devices, and per district ' +
        'the residents\' happiness, fear and anxiety (0-100) with what drives them. Districts are sorted by fear, most afraid first. ' +
        'Defenders see staged operations only as anonymous "rumours"; commanders see the operation ids.',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    () =>
      as(caller, async () => {
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
      }),
  )

  server.registerTool(
    'list_districts',
    {
      title: 'Districts and landmarks',
      description: 'Every district of Achrona with its lore, population and its five landmarks (site ids and names). Use the site ids in other tools.',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    () =>
      as(caller, async () =>
        ok(
          `${DISTRICT_IDS.length} districts, ${SITE_TYPES.length} landmarks each.`,
          DISTRICT_IDS.map((id) => ({
            district: id,
            name: DISTRICTS[id].name,
            lore: DISTRICTS[id].lore,
            population: DISTRICTS[id].population,
            sites: SITE_TYPES.map((t) => ({ siteId: siteId(id, t), name: DISTRICTS[id].sites[t], type: SITE_META[t].label })),
          })),
        ),
      ),
  )

  server.registerTool(
    'get_district',
    {
      title: 'District intel',
      description:
        'Intel on one district: residents\' mood and what drives it, overheard chatter, open glitches there, and its landmarks. ' +
        'Commanders also get the district\'s operations log (planned, executed and cancelled false flags).',
      inputSchema: z.strictObject({ district: z.string().describe('District id or name, e.g. "greenhold" or "Mire Wells".') }),
      annotations: READ,
    },
    ({ district }) =>
      as(caller, async () => {
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
      }),
  )

  server.registerTool(
    'list_active_bombs',
    {
      title: 'Armed devices',
      description: `Planted devices that are ticking right now, with their site and when the fuse runs out. A fuse lasts ${FUSE_SECONDS} seconds from arming.`,
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    () =>
      as(caller, async () => {
        const [bombs, blasts] = await Promise.all([getActiveBombs(), getRecentBlasts()])
        const now = Date.now()
        const armed = bombs.map((b) => ({ ...b, secondsLeft: Math.max(0, Math.round((new Date(b.fuseEndsAt).getTime() - now) / 1000)) }))
        const summary = armed.length === 0 ? 'No armed devices right now.' : `${armed.length} armed device(s): act fast, use get_bomb then cut_wire.`
        return ok(`${summary}${blasts.length ? ` ${blasts.length} recent detonation(s).` : ''}`, { armed, recentDetonations: blasts })
      }),
  )

  server.registerTool(
    'list_incidents',
    {
      title: 'Incident history',
      description:
        'What happened where over the last week, newest first: blackouts, fires, explosions, disappearances and so on, with casualties, injured ' +
        'and radius in metres. Commanders also see which operation caused each one.',
      inputSchema: z.strictObject({ district: z.string().optional().describe('District id or name. Leave out for all districts.') }),
      annotations: READ,
    },
    (args) =>
      as(caller, async () => {
        const district = args.district ? resolveDistrict(args.district) : undefined
        const incidents = await getIncidents({ data: { district } })
        const dead = incidents.reduce((s, i) => s + (i.countWord === 'dead' ? i.casualties : 0), 0)
        return ok(`${incidents.length} incident(s) in the last week${district ? ` in ${DISTRICTS[district].name}` : ''}, ${dead} dead in total.`, incidents)
      }),
  )

  server.registerTool(
    'get_bomb',
    {
      title: 'Inspect a device',
      description:
        'One planted device (by the glitch id of its file): status, seconds left, the wires from left to right (index 0 = leftmost) and the defusal manual. ' +
        `Follow the manual step by step: the step to do next is manual[cut.length]. Wrong cuts are strikes (${MAX_STRIKES} = boom) and burn ${STRIKE_PENALTY_SECONDS}s of fuse.`,
      inputSchema: z.strictObject({ glitchId: glitchIdSchema.describe('Glitch id of the device, from list_active_bombs.') }),
      annotations: READ,
    },
    ({ glitchId }) =>
      as(caller, async () => {
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
      }),
  )

  server.registerTool(
    'get_leaderboard',
    {
      title: 'Leaderboard',
      description: 'Defenders ranked by points, with their badges, and how points are earned.',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    () =>
      as(caller, async () => {
        const rows = await getLeaderboard()
        return ok(`${rows.length} defenders ranked.`, {
          scoring: Object.values(SCORING),
          rankings: rows.map((r) => ({ ...r, badges: r.badges.map((b) => b.label) })),
        })
      }),
  )

  // ── Defenders and up ─────────────────────────────────────────────────────

  if (isReporter) {
    server.registerTool(
      'report_echo',
      {
        title: 'Report an echo',
        description:
          'Report a sighting. Without glitchId it opens a NEW glitch (status LEAKED) in a district, optionally at a landmark. ' +
          'With glitchId it adds an update to that existing glitch. Before opening a new one, check list_glitches for a matching open glitch.',
        inputSchema: z.strictObject({
          description: z.string().min(3).max(500).describe('What was seen, in plain words (3-500 characters).'),
          glitchId: glitchIdSchema.optional().describe('Existing glitch to update. Leave out to open a new glitch.'),
          district: z.string().optional().describe('District id or name. Needed for a new glitch unless `site` is given.'),
          site: z.string().optional().describe('Optional landmark: site id ("clockworks:station") or name ("Clockworks Central").'),
        }),
        annotations: WRITE,
      },
      (args) =>
        as(caller, async () => {
          const site = args.site ? resolveSite(args.site) : undefined
          const district = args.district ? resolveDistrict(args.district) : site?.district
          if (site && district && site.district !== district) {
            return fail(`${site.name} is in ${DISTRICTS[site.district].name}, not ${DISTRICTS[district].name}.`)
          }
          if (!args.glitchId && !district) return fail('Say where it happened: give `district` or `site` for a new glitch.')
          const res = await reportEcho({ data: { description: args.description, glitchId: args.glitchId, district, siteId: site?.siteId } })
          return ok(args.glitchId ? `Echo ${res.echoId} added to ${res.glitchId}.` : `New glitch ${res.glitchId} opened (LEAKED) with echo ${res.echoId}.`, res)
        }),
    )

    server.registerTool(
      'cut_wire',
      {
        title: 'Cut a wire',
        description:
          'Cut one wire on an armed device to defuse it. `wire` is the 0-based index from the left, as listed by get_bomb. ' +
          'Read get_bomb first and follow manual[cut.length]. A correct cut advances the manual; the last correct cut defuses it and earns hero points. ' +
          `A wrong cut is a strike and burns ${STRIKE_PENALTY_SECONDS}s; ${MAX_STRIKES} strikes and it detonates. Cannot be undone.`,
        inputSchema: z.strictObject({
          glitchId: glitchIdSchema.describe('Glitch id of the device.'),
          wire: z.number().int().min(0).max(9).describe('0-based wire index from the left.'),
        }),
        annotations: { ...WRITE, destructiveHint: true },
      },
      ({ glitchId, wire }) =>
        as(caller, async () => {
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
        }),
    )
  }

  // ── Commanders and admins ────────────────────────────────────────────────

  if (isCommander) {
    server.registerTool(
      'set_glitch_status',
      {
        title: 'Change glitch status',
        description: 'Move a glitch through its lifecycle: LEAKED -> ASSESSING -> CONTAINING -> FIXED (any status may be set). Fixed glitches stop draining grid integrity and calm residents.',
        inputSchema: z.strictObject({ glitchId: glitchIdSchema, status: z.enum(GLITCH_STATUSES) }),
        annotations: { ...WRITE, idempotentHint: true },
      },
      ({ glitchId, status }) =>
        as(caller, async () => {
          const before = await getGlitch({ data: glitchId })
          if (!before) return fail(`There is no glitch ${glitchId}. Use list_glitches to find the right id.`)
          await setGlitchStatus({ data: { glitchId, status } })
          return ok(`${glitchId}: ${before.status} -> ${status}.`, { glitchId, from: before.status, to: status })
        }),
    )

    server.registerTool(
      'list_operation_types',
      {
        title: 'Operation types',
        description:
          'The kinds of false flag operation a commander can stage, with their effect on residents\' mood (happiness/fear/anxiety deltas), ' +
          'how each site type amplifies it, and how long effects last.',
        inputSchema: z.strictObject({}),
        annotations: READ,
      },
      () =>
        as(caller, async () =>
          ok(`${OPERATION_TYPES.length} operation types.`, {
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
          }),
        ),
    )

    server.registerTool(
      'plan_operation',
      {
        title: 'Plan a false flag operation',
        description:
          'Stage a fake incident at a landmark (the "attack on the world"). When it goes off it appears to defenders as an ordinary LEAKED glitch ' +
          'carrying the cover story, and the district\'s residents get scared. delayMinutes 0 = goes off immediately; max 1440 (24h). ' +
          'Planned operations can be cancelled with cancel_operation until they go off. See list_operation_types for types and effects.',
        inputSchema: z.strictObject({
          site: z.string().describe('Site id ("rustmarket:square") or landmark name ("Barter Ring").'),
          type: z.enum(OPERATION_TYPES).describe('Operation type, see list_operation_types.'),
          delayMinutes: z.number().int().min(0).max(1440).describe('Minutes from now until it goes off. 0 = now.'),
          coverStory: z.string().max(300).optional().describe('What defenders will read. Leave out for a fitting default.'),
        }),
        annotations: WRITE,
      },
      (args) =>
        as(caller, async () => {
          const site = resolveSite(args.site)
          const { operationId } = await planOperation({
            data: { siteId: site.siteId, type: args.type, delayMinutes: args.delayMinutes, coverStory: args.coverStory },
          })
          const intel = await getDistrict({ data: site.district })
          const op = intel.operations?.find((o) => o.operationId === operationId)
          const when = args.delayMinutes === 0 ? 'now' : `in ${args.delayMinutes} minute(s)`
          return ok(`${operationId} planned: ${OPERATION_META[args.type].name} at ${site.name}, goes off ${when}.`, {
            ...(op ? operationView(op) : { operationId, siteId: site.siteId }),
            expectedEffect: OPERATION_META[args.type].effect,
            siteAmplifier: SITE_IMPACT[site.type],
          })
        }),
    )

    server.registerTool(
      'cancel_operation',
      {
        title: 'Cancel an operation',
        description: 'Call off a PLANNED operation before it goes off. Operations that already went off cannot be undone.',
        inputSchema: z.strictObject({
          operationId: z.string().regex(/^OP-\d+$/, 'An operation id looks like "OP-0004" (capital OP).'),
        }),
        annotations: { ...WRITE, idempotentHint: true },
      },
      ({ operationId }) =>
        as(caller, async () => {
          await cancelOperation({ data: operationId })
          return ok(`${operationId} cancelled.`)
        }),
    )

    server.registerTool(
      'list_operations',
      {
        title: 'Operations log',
        description: 'All false flag operations across every district, newest first. Filter by status (PLANNED, EXECUTED, CANCELLED) or district.',
        inputSchema: z.strictObject({
          status: z.enum(['PLANNED', 'EXECUTED', 'CANCELLED']).optional(),
          district: z.string().optional().describe('District id or name.'),
        }),
        annotations: READ,
      },
      (args) =>
        as(caller, async () => {
          const ids = args.district ? [resolveDistrict(args.district)] : [...DISTRICT_IDS]
          const logs = await Promise.all(ids.map((id) => getDistrict({ data: id })))
          const ops = logs
            .flatMap((l) => l.operations ?? [])
            .filter((o) => !args.status || o.status === args.status)
            .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
          return ok(`${ops.length} operation(s).`, ops.map(operationView))
        }),
    )
  }

  // ── Resources and prompts ────────────────────────────────────────────────

  server.registerResource(
    'districts',
    'achrona://districts',
    { title: 'Districts of Achrona', description: 'Every district with lore, population and landmark site ids.', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            DISTRICT_IDS.map((id) => ({
              district: id,
              name: DISTRICTS[id].name,
              lore: DISTRICTS[id].lore,
              population: DISTRICTS[id].population,
              sites: Object.fromEntries(SITE_TYPES.map((t) => [siteId(id, t), DISTRICTS[id].sites[t]])),
            })),
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerPrompt(
    'situation_report',
    { title: 'Situation report', description: 'Brief me on Achrona: integrity, the most afraid districts, open glitches and armed devices.' },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Give me a short situation report of Achrona. Use get_world, then list_glitches with openOnly. ' +
              'Lead with grid integrity and any armed devices (they are urgent), then the three most afraid districts and why, ' +
              'then the open glitches that nobody is on yet (LEAKED). End with what I should do next given my role (see whoami).',
          },
        },
      ],
    }),
  )

  if (isReporter) {
    server.registerPrompt(
      'defuse',
      {
        title: 'Defuse a device',
        description: 'Find an armed device and defuse it by following its manual.',
        argsSchema: { site: z.string().optional().describe('Landmark of the device, e.g. "Broken Bridge Halt". Optional.') },
      },
      ({ site }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Defuse the armed device${site ? ` at ${site}` : ''}. Call list_active_bombs, then get_bomb. ` +
                'The fuse is short, so be quick but careful: for each step, read manual[cut.length], work out which wire index (0 = leftmost) it means ' +
                'from the wire colours, and call cut_wire. Re-check the response before the next cut. Report the outcome.',
            },
          },
        ],
      }),
    )
  }

  if (isCommander) {
    server.registerPrompt(
      'plan_attack',
      {
        title: 'Plan a false flag',
        description: 'Pick the best site and operation type for a goal, then plan it.',
        argsSchema: {
          goal: z.string().describe('What the operation should achieve, e.g. "scare Greenhold" or "make Rustmarket anxious".'),
          delayMinutes: z.string().optional().describe('Minutes until it goes off (default 10).'),
        },
      },
      ({ goal, delayMinutes }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Goal: ${goal}. Use get_world, list_operation_types and get_district to choose the site and operation type with the best effect ` +
                `(mind the site amplifiers). Write a believable cover story, then call plan_operation with delayMinutes ${delayMinutes || '10'}. ` +
                'Tell me what you planned, why, and the operation id so I can cancel it.',
            },
          },
        ],
      }),
    )
  }

  return server
}
