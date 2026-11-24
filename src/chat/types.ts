// Pure and shared (client + server): what the CUSTODIAN chat dock renders.
// The server owns the conversation; the client only ever gets this view.

export type ActionStatus = 'queued' | 'pending' | 'done' | 'failed' | 'rejected'

export type ChatEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  /** Read tools CUSTODIAN ran on its own ("consulted: list_glitches, get_world"). */
  | { id: string; kind: 'consulted'; tools: string[] }
  /** A write or attack CUSTODIAN wants to perform: it waits for the operator. */
  | {
      id: string
      kind: 'action'
      actionId: string
      tool: string
      title: string
      effect: 'write' | 'attack'
      summary: string
      /** The exact parameters the tool will run with, as display strings. */
      params: Array<{ name: string; value: string }>
      status: ActionStatus
      /** First line of the tool's answer once it ran (or why it didn't). */
      result?: string
    }
  | { id: string; kind: 'notice'; tone: 'info' | 'error'; text: string }

export type ChatView = {
  threadId: string
  entries: ChatEntry[]
  /** The action card waiting for Approve / Reject, if any. */
  pendingActionId: string | null
}

export type ChatStatus =
  | { online: true; model: string }
  | { online: false; reason: string }

export const CHAT_LIMITS = {
  /** Characters per operator message. */
  maxMessageChars: 2000,
} as const
