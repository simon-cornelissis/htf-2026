// Pure and shared: suggested first prompts in the CUSTODIAN dock, by role.
import { canCommand, canReport, type GuardianRole } from '#/lib/glitch.ts'

export type Starter = { label: string; prompt: string }

export function startersFor(role: GuardianRole): Starter[] {
  const out: Starter[] = [
    { label: 'Situation report', prompt: 'Situation report.' },
    { label: 'Most afraid district', prompt: 'Which district is most afraid, and why?' },
    { label: 'Anything ticking?', prompt: 'Is any device armed right now?' },
  ]
  if (canReport(role)) {
    out.push({ label: 'Report smoke', prompt: 'Report: smoke over Fountain Square in Greenhold.' })
  }
  if (canCommand(role)) {
    out.push(
      { label: 'Plan a supply scare', prompt: 'Plan a supply scare at the Rustmarket square in 5 minutes.' },
      { label: 'Operations log', prompt: 'Which operations are still planned?' },
    )
  }
  return out
}
