// Server-only: CUSTODIAN's conversation engine. A manual tool-use loop on the
// Anthropic Messages API with an approval gate:
//   - read tools run straight away, as the operator (runAs via `execute`);
//   - write/attack tools stop the loop and become an approval card; the
//     operator approves (the tool runs as them) or rejects (the model gets an
//     error result), then the loop continues.
// The model's tool calls are kept server-side: the client only sends
// "approve/reject action X", never a tool name or parameters.
//
// Everything with side effects is injected (Messages API, tool execution,
// clock), so the loop is unit-tested without the network or the database.
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import * as z from 'zod'
import type { Guardian, GuardianRole } from '#/lib/glitch.ts'
import type { ToolDef, ToolResult } from '#/mcp/tools.ts'
import { systemPromptFor } from './prompt.ts'
import type { ChatEntry, ChatView } from './types.ts'

export const CHAT_MODEL = 'claude-opus-5-5'

export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>

export type EngineLimits = {
  /** Model calls per operator turn (one send or one decision) before CUSTODIAN stops. */
  maxIterations: number
  maxTokens: number
  /** Operator messages + decisions per guardian per minute. */
  turnsPerMinute: number
  threadTtlMs: number
  threadsPerGuardian: number
  /** Hard cap on API messages per thread; start a new thread after. */
  maxMessages: number
  /** Characters of a tool result sent to the model. */
  maxToolResultChars: number
}

const DEFAULT_LIMITS: EngineLimits = {
  maxIterations: 8,
  maxTokens: 16000,
  turnsPerMinute: 12,
  threadTtlMs: 60 * 60 * 1000,
  threadsPerGuardian: 4,
  maxMessages: 160,
  maxToolResultChars: 40_000,
}

export type EngineDeps = {
  /** Calls the Messages API (beta endpoint, for server-side fallbacks). */
  createMessage: CreateMessage
  /** The tools a role may use, in a fixed order. */
  toolsFor: (role: GuardianRole) => readonly ToolDef[]
  /** Validate and run a tool as the caller. */
  execute: (def: ToolDef, input: unknown, caller: Guardian) => Promise<ToolResult>
  now?: () => number
  limits?: Partial<EngineLimits>
}

/** An error the operator should read as-is (rate limit, busy, stale action). */
export class ChatError extends Error {}

type QueuedCall = { toolUseId: string; actionId: string; entryId: string; name: string; input: unknown }

type Thread = {
  id: string
  guardianId: string
  role: GuardianRole
  messages: BetaMessageParam[]
  entries: ChatEntry[]
  /** Tool results of the current assistant turn, while actions wait for approval. */
  batch: { order: string[]; results: Map<string, BetaToolResultBlockParam>; queue: QueuedCall[] } | null
  busy: boolean
  updatedAt: number
}

const REJECTED = 'Rejected by the operator.'

export function createChatEngine(deps: EngineDeps) {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits }
  const now = deps.now ?? Date.now
  const threads = new Map<string, Thread>()
  const turns = new Map<string, number[]>()
  const toolParamCache = new Map<GuardianRole, BetaTool[]>()

  const key = (guardianId: string, threadId: string) => `${guardianId}\u0000${threadId}`

  function sweep() {
    const cutoff = now() - limits.threadTtlMs
    for (const [k, t] of threads) if (t.updatedAt < cutoff && !t.busy) threads.delete(k)
  }

  function rateLimit(guardianId: string) {
    const t = now()
    const recent = (turns.get(guardianId) ?? []).filter((x) => x > t - 60_000)
    if (recent.length >= limits.turnsPerMinute) {
      throw new ChatError('CUSTODIAN is rate-limited: too many requests this minute. Wait a moment.')
    }
    recent.push(t)
    turns.set(guardianId, recent)
  }

  function newThread(caller: Guardian): Thread {
    const mine = [...threads.values()].filter((t) => t.guardianId === caller.guardianId).sort((a, b) => a.updatedAt - b.updatedAt)
    while (mine.length >= limits.threadsPerGuardian) threads.delete(key(caller.guardianId, mine.shift()!.id))
    const t: Thread = {
      id: randomUUID(),
      guardianId: caller.guardianId,
      role: caller.role,
      messages: [],
      entries: [],
      batch: null,
      busy: false,
      updatedAt: now(),
    }
    threads.set(key(caller.guardianId, t.id), t)
    return t
  }

  /** Threads are only ever found under the guardian who owns them. */
  function findThread(caller: Guardian, threadId: string | undefined): Thread | null {
    sweep()
    if (!threadId) return null
    const t = threads.get(key(caller.guardianId, threadId))
    if (!t) return null
    // Tools and system prompt depend on the role: a role change starts over.
    if (t.role !== caller.role) {
      threads.delete(key(caller.guardianId, threadId))
      return null
    }
    return t
  }

  function view(t: Thread): ChatView {
    const pending = t.batch?.queue[0]
    return { threadId: t.id, entries: t.entries.map((e) => ({ ...e })), pendingActionId: pending?.actionId ?? null }
  }

  function toolParams(role: GuardianRole): BetaTool[] {
    let tools = toolParamCache.get(role)
    if (!tools) {
      tools = deps.toolsFor(role).map((def) => {
        const { $schema: _drop, ...schema } = z.toJSONSchema(def.input, { reused: 'ref' }) as Record<string, unknown>
        return { name: def.name, description: def.description, input_schema: schema as BetaTool['input_schema'] }
      })
      toolParamCache.set(role, tools)
    }
    return tools
  }

  function params(t: Thread): MessageCreateParamsNonStreaming {
    return {
      model: CHAT_MODEL,
      max_tokens: limits.maxTokens,
      // Claude Opus 5.5: thinking is always adaptive; effort is the dial (its default is medium, set explicitly).
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // On a policy decline, the API re-runs the request on a fallback model server-side.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Stable prefix: tools (fixed per role) + system (fixed per role) are cached,
      // and the top-level breakpoint caches the conversation so far.
      system: [{ type: 'text', text: systemPromptFor(t.role), cache_control: { type: 'ephemeral' } }],
      tools: toolParams(t.role),
      cache_control: { type: 'ephemeral' },
      messages: t.messages,
    }
  }

  const entryId = () => randomUUID().slice(0, 8)
  const firstLine = (s: string) => {
    const line = s.split('\n', 1)[0]
    return line.length > 300 ? `${line.slice(0, 299)}…` : line
  }

  function toolResultBlock(toolUseId: string, r: ToolResult): BetaToolResultBlockParam {
    const text = r.text.length > limits.maxToolResultChars ? `${r.text.slice(0, limits.maxToolResultChars)}\n[truncated]` : r.text
    return { type: 'tool_result', tool_use_id: toolUseId, content: text || '(empty)', ...(r.isError ? { is_error: true } : {}) }
  }

  /**
   * The assistant content to send back. After a mid-output fallback, blocks of
   * the declined model before the last `fallback` block (thinking, tool calls)
   * must be left out; the fallback block itself stays where it is.
   */
  function echoable(content: BetaContentBlock[]): BetaContentBlock[] {
    const last = content.map((b) => b.type).lastIndexOf('fallback')
    if (last <= 0) return content
    return content.filter((b, i) => i >= last || !['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use'].includes(b.type))
  }

  function finishBatch(t: Thread): BetaToolResultBlockParam[] {
    const b = t.batch!
    t.batch = null
    return b.order.map((id) => b.results.get(id) ?? toolResultBlock(id, { isError: true, text: REJECTED }))
  }

  /** Model <-> read tools until the turn ends or an action needs the operator. */
  async function loop(t: Thread, caller: Guardian) {
    for (let i = 0; i < limits.maxIterations; i++) {
      if (t.messages.length >= limits.maxMessages) {
        t.entries.push({ id: entryId(), kind: 'notice', tone: 'info', text: 'This thread is full. Start a new one to continue.' })
        return
      }
      let res: BetaMessage
      try {
        res = await deps.createMessage(params(t))
      } catch (err) {
        t.entries.push({ id: entryId(), kind: 'notice', tone: 'error', text: describeApiError(err) })
        return
      }

      if (res.stop_reason === 'refusal') {
        // Keep the conversation valid (user/assistant alternation) without echoing declined output.
        t.messages.push({ role: 'assistant', content: [{ type: 'text', text: '(Request declined.)' }] })
        const category = res.stop_details?.category
        t.entries.push({
          id: entryId(),
          kind: 'notice',
          tone: 'error',
          text: `CUSTODIAN declined this request${category ? ` (${category.replace(/_/g, ' ')})` : ''}. Rephrase it, or do it in the app.`,
        })
        return
      }

      const content = echoable(res.content)
      t.messages.push({ role: 'assistant', content })

      const text = content
        .filter((b): b is Extract<BetaContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      if (text) t.entries.push({ id: entryId(), kind: 'assistant', text })

      if (res.stop_reason === 'pause_turn') continue

      const calls = content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use')
      if (calls.length === 0) {
        if (res.stop_reason === 'max_tokens') {
          t.entries.push({ id: entryId(), kind: 'notice', tone: 'info', text: 'Transmission cut off (length limit).' })
        }
        return
      }

      const results = new Map<string, BetaToolResultBlockParam>()
      const queue: QueuedCall[] = []
      const consulted: string[] = []

      for (const call of calls) {
        if (res.stop_reason === 'max_tokens') {
          // A call cut off at the length limit may carry a truncated input: never run it.
          results.set(call.id, toolResultBlock(call.id, { isError: true, text: 'Your output was cut off; this call was not run. Try again with a shorter call.' }))
          continue
        }
        // Never trust the model's choice of tool: only the role's own tools exist.
        const def = deps.toolsFor(t.role).find((d) => d.name === call.name)
        if (!def) {
          results.set(call.id, toolResultBlock(call.id, { isError: true, text: `${call.name} is not available at this operator's clearance.` }))
          continue
        }
        const parsed = def.input.safeParse(call.input ?? {})
        if (!parsed.success) {
          results.set(call.id, toolResultBlock(call.id, { isError: true, text: `Invalid arguments for ${def.name}: ${z.prettifyError(parsed.error)}` }))
          continue
        }
        const effect = def.effectFor ? safeEffect(def, parsed.data) : def.effect
        if (effect === 'read') {
          results.set(call.id, toolResultBlock(call.id, await deps.execute(def, parsed.data, caller)))
          consulted.push(def.name)
          continue
        }
        const actionId = randomUUID()
        const id = entryId()
        queue.push({ toolUseId: call.id, actionId, entryId: id, name: def.name, input: parsed.data })
        t.entries.push({
          id,
          kind: 'action',
          actionId,
          tool: def.name,
          title: def.title,
          effect,
          summary: summarize(def, parsed.data),
          params: displayParams(parsed.data),
          status: queue.length === 1 ? 'pending' : 'queued',
        })
      }

      if (consulted.length) {
        // Show consulted tools before the action cards of the same turn.
        const firstAction = t.entries.findIndex((e) => e.kind === 'action' && queue.some((q) => q.entryId === e.id))
        const entry: ChatEntry = { id: entryId(), kind: 'consulted', tools: consulted }
        if (firstAction === -1) t.entries.push(entry)
        else t.entries.splice(firstAction, 0, entry)
      }

      t.batch = { order: calls.map((c) => c.id), results, queue }
      if (queue.length) return // wait for the operator
      t.messages.push({ role: 'user', content: finishBatch(t) })
    }
    t.entries.push({ id: entryId(), kind: 'notice', tone: 'info', text: `CUSTODIAN stopped after ${limits.maxIterations} steps. Ask it to continue if needed.` })
  }

  async function withThread<T>(t: Thread, fn: () => Promise<T>): Promise<T> {
    if (t.busy) throw new ChatError('CUSTODIAN is still working on the last request.')
    t.busy = true
    try {
      return await fn()
    } finally {
      t.busy = false
      t.updatedAt = now()
    }
  }

  function markAction(t: Thread, call: QueuedCall, status: 'done' | 'failed' | 'rejected', result: string) {
    const e = t.entries.find((x) => x.id === call.entryId)
    if (e?.kind === 'action') {
      e.status = status
      e.result = result
    }
  }

  function promoteNext(t: Thread) {
    const next = t.batch?.queue[0]
    const e = next && t.entries.find((x) => x.id === next.entryId)
    if (e?.kind === 'action') e.status = 'pending'
  }

  return {
    getThread(caller: Guardian, threadId: string | undefined): ChatView | null {
      const t = findThread(caller, threadId)
      return t ? view(t) : null
    },

    reset(caller: Guardian, threadId: string | undefined) {
      if (threadId) threads.delete(key(caller.guardianId, threadId))
    },

    /** The operator's message. If actions were waiting, a new message rejects them. */
    async send(caller: Guardian, threadId: string | undefined, text: string): Promise<ChatView> {
      const clean = text.trim()
      if (!clean) throw new ChatError('Say something first.')
      const t = findThread(caller, threadId) ?? newThread(caller)
      return withThread(t, async () => {
        rateLimit(caller.guardianId)
        const content: Array<BetaToolResultBlockParam | BetaTextBlockParam> = []
        if (t.batch) {
          for (const call of t.batch.queue) {
            t.batch.results.set(call.toolUseId, toolResultBlock(call.toolUseId, { isError: true, text: `${REJECTED} They sent a new message instead.` }))
            markAction(t, call, 'rejected', 'Rejected: you sent a new message.')
          }
          content.push(...finishBatch(t))
        }
        content.push({ type: 'text', text: clean })
        t.messages.push({ role: 'user', content })
        t.entries.push({ id: entryId(), kind: 'user', text: clean })
        await loop(t, caller)
        return view(t)
      })
    },

    /** Approve or reject the pending action. Only the action the server is waiting for can be decided. */
    async decide(caller: Guardian, threadId: string, actionId: string, approve: boolean): Promise<ChatView & { executed: boolean }> {
      const t = findThread(caller, threadId)
      if (!t) throw new ChatError('This conversation expired. Start a new one.')
      return withThread(t, async () => {
        const call = t.batch?.queue[0]
        if (!t.batch || !call || call.actionId !== actionId) throw new ChatError('That action is no longer waiting for a decision.')
        rateLimit(caller.guardianId)
        let executed = false
        if (approve) {
          // Re-check against the operator's role right now, not when the model asked.
          const def = deps.toolsFor(caller.role).find((d) => d.name === call.name)
          const r: ToolResult = def ? await deps.execute(def, call.input, caller) : { isError: true, text: `${call.name} is not available at your clearance.` }
          executed = !r.isError
          t.batch.results.set(call.toolUseId, toolResultBlock(call.toolUseId, r))
          markAction(t, call, r.isError ? 'failed' : 'done', firstLine(r.text))
        } else {
          t.batch.results.set(call.toolUseId, toolResultBlock(call.toolUseId, { isError: true, text: REJECTED }))
          markAction(t, call, 'rejected', 'Rejected.')
        }
        t.batch.queue.shift()
        if (t.batch.queue.length) {
          promoteNext(t)
          return { ...view(t), executed }
        }
        t.messages.push({ role: 'user', content: finishBatch(t) })
        await loop(t, caller)
        return { ...view(t), executed }
      })
    },

    /** For tests and diagnostics: the raw API messages of a thread. */
    _messages(caller: Guardian, threadId: string): BetaMessageParam[] | undefined {
      return threads.get(key(caller.guardianId, threadId))?.messages
    },
  }
}

export type ChatEngine = ReturnType<typeof createChatEngine>

function safeEffect(def: ToolDef, input: unknown): ToolDef['effect'] {
  try {
    return def.effectFor?.(input as never) ?? def.effect
  } catch {
    return def.effect
  }
}

function displayParams(input: unknown): Array<{ name: string; value: string }> {
  if (!input || typeof input !== 'object') return []
  return Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([name, v]) => ({ name, value: typeof v === 'string' ? v : JSON.stringify(v) }))
}

function summarize(def: ToolDef, input: unknown): string {
  try {
    return def.summarize?.(input as never) ?? `${def.title}.`
  } catch {
    return `${def.title}.`
  }
}

/** Readable text for an API failure. Never includes the key. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'CUSTODIAN offline: the API key was rejected. Check ANTHROPIC_API_KEY in .env and restart the dev server.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'CUSTODIAN offline: this API key may not use the model.'
  if (err instanceof Anthropic.RateLimitError) return 'CUSTODIAN is overloaded (rate limit). Try again in a minute.'
  if (err instanceof Anthropic.BadRequestError) return `CUSTODIAN could not process that request: ${err.message}`
  if (err instanceof Anthropic.OverloadedError || err instanceof Anthropic.ServiceUnavailableError) return 'The CUSTODIAN uplink is overloaded. Try again shortly.'
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.GatewayTimeoutError) return 'The CUSTODIAN uplink is down (server error). Try again shortly.'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'The CUSTODIAN uplink timed out. Try again.'
  if (err instanceof Anthropic.APIConnectionError) return 'Cannot reach the CUSTODIAN uplink (network). Check the connection.'
  if (err instanceof Anthropic.APIError) return `CUSTODIAN error ${err.status ?? ''}: ${err.message}`.trim()
  return 'CUSTODIAN malfunctioned. Try again.'
}
