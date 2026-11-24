// Pure and shared: what an MCP client may do per role. Used by the MCP server
// (whoami) and the MCP access page, so both say the same thing.
import { canCommand, canReport, type GuardianRole } from '#/lib/glitch.ts'

export const MCP_TOOLS = {
  everyone: ['whoami', 'list_glitches', 'get_glitch', 'get_world', 'list_districts', 'get_district', 'list_active_bombs', 'list_incidents', 'get_bomb', 'get_leaderboard', 'list_persons', 'get_person', 'get_exposure', 'get_sensor_status'],
  reporter: ['report_echo', 'cut_wire'],
  commander: ['set_glitch_status', 'list_operation_types', 'plan_operation', 'cancel_operation', 'list_operations', 'act_on_person', 'add_case_note', 'attribute_glitch', 'ingest_sensor_reading'],
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
    'Read the persons of interest index and their case files',
    'Read recent resource sensor readings and automatically detected anomalies',
  ]
  if (canReport(role)) caps.push('Report echoes: open new glitches or add updates to existing ones', 'Defuse armed devices by cutting wires')
  if (canCommand(role)) {
    caps.push(
      'Change a glitch’s status',
      'See which glitches were staged, and the operations log',
      'Plan false flag operations (incl. planted devices), pin them on a person, and cancel planned ones',
      'Issue warrants, detain or erase persons of interest, add case notes and pin glitches on them',
      'Ingest trusted sensor readings; a resource drop of at least 40% in five minutes automatically opens a glitch',
    )
  }
  return caps
}
