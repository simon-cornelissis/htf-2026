// Pure and shared: what an MCP client may do per role. Used by the MCP server
// (whoami) and the MCP access page, so both say the same thing.
import { canCommand, canReport, type GuardianRole } from '#/lib/glitch.ts'

export const MCP_TOOLS = {
  everyone: ['whoami', 'list_glitches', 'get_glitch', 'get_world', 'list_districts', 'get_district', 'list_active_bombs', 'list_incidents', 'get_bomb', 'get_leaderboard'],
  reporter: ['report_echo', 'cut_wire'],
  commander: ['set_glitch_status', 'list_operation_types', 'plan_operation', 'cancel_operation', 'list_operations'],
} as const

export function toolsFor(role: GuardianRole): string[] {
  return [
    ...MCP_TOOLS.everyone,
    ...(canReport(role) ? MCP_TOOLS.reporter : []),
    ...(canCommand(role) ? MCP_TOOLS.commander : []),
  ]
}

/** Capabilities in plain words. */
export function capabilitiesFor(role: GuardianRole): string[] {
  const caps = [
    'Read the glitch board, glitch files and their echoes, and search them',
    'Read the world state: grid integrity and how afraid each district is',
    'Read district intel, overheard chatter and every landmark',
    'See armed devices with their wires and defusal manual',
    'Read the incident history of the last week, with casualties',
    'Read the leaderboard',
  ]
  if (canReport(role)) caps.push('Report echoes: open new glitches or add updates to existing ones', 'Defuse armed devices by cutting wires')
  if (canCommand(role)) {
    caps.push(
      'Change a glitch’s status',
      'See which glitches were staged, and the operations log',
      'Plan false flag operations (incl. planted devices) and cancel planned ones',
    )
  }
  return caps
}
