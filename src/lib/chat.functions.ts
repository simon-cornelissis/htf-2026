// Server functions behind the CUSTODIAN chat dock. The client only sends text,
// a thread id and "approve/reject action X": never a tool name or parameters.
import { createServerFn } from '@tanstack/react-start'
import { requireGuardian } from '#/lib/session.ts'
import { ChatError } from '#/chat/engine.ts'
import { CHAT_OFFLINE_MESSAGE, chatStatus, custodian } from '#/chat/server.ts'
import { CHAT_LIMITS, type ChatStatus, type ChatView } from '#/chat/types.ts'

const threadIdOf = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[0-9a-f-]{36}$/i.test(s) ? s : undefined
}

function engineOrThrow() {
  const engine = custodian()
  if (!engine) throw new Error(CHAT_OFFLINE_MESSAGE)
  return engine
}

/** Re-throw operator-facing errors as plain Errors (their message reaches the client). */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ChatError) throw new Error(err.message)
    throw err
  }
}

/** Whether CUSTODIAN is online (API key configured). */
export const getChatStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<ChatStatus> => {
  requireGuardian()
  return chatStatus()
})

/** A thread you own, or null when it expired. */
export const getChatThread = createServerFn({ method: 'GET' })
  .validator((input: { threadId?: string }) => ({ threadId: threadIdOf(input?.threadId) }))
  .handler(async ({ data }): Promise<ChatView | null> => {
    const guardian = requireGuardian()
    return custodian()?.getThread(guardian, data.threadId) ?? null
  })

export const sendChatMessage = createServerFn({ method: 'POST' })
  .validator((input: { threadId?: string; text: string }) => {
    const text = String(input?.text ?? '').trim()
    if (!text) throw new Error('Say something first.')
    if (text.length > CHAT_LIMITS.maxMessageChars) throw new Error(`Keep it under ${CHAT_LIMITS.maxMessageChars} characters.`)
    return { threadId: threadIdOf(input?.threadId), text }
  })
  .handler(async ({ data }): Promise<ChatView> => {
    const guardian = requireGuardian()
    return guarded(() => engineOrThrow().send(guardian, data.threadId, data.text))
  })

export const decideChatAction = createServerFn({ method: 'POST' })
  .validator((input: { threadId: string; actionId: string; approve: boolean }) => {
    const threadId = threadIdOf(input?.threadId)
    const actionId = threadIdOf(input?.actionId)
    if (!threadId || !actionId) throw new Error('Unknown action.')
    return { threadId, actionId, approve: input.approve === true }
  })
  .handler(async ({ data }): Promise<ChatView & { executed: boolean }> => {
    const guardian = requireGuardian()
    return guarded(() => engineOrThrow().decide(guardian, data.threadId, data.actionId, data.approve))
  })

export const resetChat = createServerFn({ method: 'POST' })
  .validator((input: { threadId?: string }) => ({ threadId: threadIdOf(input?.threadId) }))
  .handler(async ({ data }) => {
    const guardian = requireGuardian()
    custodian()?.reset(guardian, data.threadId)
  })
