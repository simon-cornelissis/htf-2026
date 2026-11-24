// Server-only. The MCP face of Achrona. The tools themselves live in the shared
// registry (./tools.ts), which CUSTODIAN, the in-app chat assistant, uses too:
// each runs as the guardian who owns the access token, so the app's own role
// checks decide what an MCP client may do.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { DISTRICT_IDS, DISTRICTS, SITE_TYPES, siteId } from '#/lib/districts.ts'
import { canCommand, canReport, type Guardian } from '#/lib/glitch.ts'
import { FUSE_SECONDS } from '#/lib/bomb.ts'
import { executeTool, toolsForRole, type ToolResult } from './tools.ts'

const INSTRUCTIONS = `You are connected to the Guardians of the Grid terminal of Achrona, a fictional realm whose
continuity is threatened by "glitches". Everything here is a game world. You act as the signed-in guardian
and have exactly their permissions.

Vocabulary: a glitch is an incident (status LEAKED -> ASSESSING -> CONTAINING -> FIXED); an echo is a sighting
report on a glitch; districts have residents whose happiness, fear and anxiety (0-100) react to glitches.
Commanders can stage "false flag operations" that look like real glitches to defenders. A planted device
(operation type "bomb") arms a ${FUSE_SECONDS}-second fuse: anyone with defender rights can defuse it with cut_wire.

Sites are landmarks: use a site id "district:type" (e.g. "rustmarket:square") or the landmark name.
Call list_districts when unsure. Deleting glitches or echoes is not available here: that stays with humans in the app.`

const toCallToolResult = (r: ToolResult): CallToolResult => ({
  ...(r.isError ? { isError: true } : {}),
  content: [{ type: 'text', text: r.text }],
})

/** A fresh server per request (stateless), with only the tools this guardian's role may use. */
export function createAchronaMcpServer(caller: Guardian): McpServer {
  const server = new McpServer(
    { name: 'achrona-guardians-of-the-grid', title: 'Guardians of the Grid · Achrona', version: '1.0.0' },
    { instructions: INSTRUCTIONS, capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  const isReporter = canReport(caller.role)
  const isCommander = canCommand(caller.role)

  // ── Tools (shared registry, filtered by role) ────────────────────────────

  for (const def of toolsForRole(caller.role)) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: def.input, annotations: def.annotations },
      async (args: unknown) => toCallToolResult(await executeTool(def, args, caller)),
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
