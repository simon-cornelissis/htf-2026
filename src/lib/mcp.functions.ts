import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { apiTokens } from '#/db/schema.ts'
import { requireGuardian } from '#/lib/session.ts'
import { capabilitiesFor } from '#/mcp/capabilities.ts'
import { generateToken, hashToken, tokenHandle } from '#/mcp/tokens.ts'

export type McpTokenRow = {
  /** Short, non-secret handle (start of the hash). */
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

const MAX_TOKENS = 10

/** Your own access tokens, newest first, plus what an MCP client may do as you. */
export const getMcpAccess = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ tokens: McpTokenRow[]; capabilities: string[] }> => {
    const guardian = requireGuardian()
    const rows = db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.guardianId, guardian.guardianId))
      .orderBy(desc(apiTokens.createdAt))
      .all()
    return {
      tokens: rows.map((r) => ({ id: tokenHandle(r.tokenHash), label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt })),
      capabilities: capabilitiesFor(guardian.role),
    }
  },
)

/** Create a token. The plain token is returned once and never stored. */
export const createMcpToken = createServerFn({ method: 'POST' })
  .validator((input: { label: string }) => {
    const label = String(input.label ?? '').trim()
    if (label.length < 1) throw new Error('Give the token a name, e.g. "Claude Code on my laptop".')
    if (label.length > 60) throw new Error('Keep the name under 60 characters.')
    return { label }
  })
  .handler(async ({ data }): Promise<{ token: string; id: string }> => {
    const guardian = requireGuardian()
    const count = db.select({ h: apiTokens.tokenHash }).from(apiTokens).where(eq(apiTokens.guardianId, guardian.guardianId)).all().length
    if (count >= MAX_TOKENS) throw new Error(`You already have ${MAX_TOKENS} tokens. Revoke one you no longer use.`)
    const token = generateToken()
    const tokenHash = hashToken(token)
    db.insert(apiTokens)
      .values({ tokenHash, guardianId: guardian.guardianId, label: data.label, createdAt: new Date().toISOString() })
      .run()
    return { token, id: tokenHandle(tokenHash) }
  })

/** Revoke one of your own tokens. Clients using it are cut off immediately. */
export const revokeMcpToken = createServerFn({ method: 'POST' })
  .validator((id: string) => {
    const s = String(id)
    if (!/^[0-9a-f]{12}$/.test(s)) throw new Error('Unknown token.')
    return s
  })
  .handler(async ({ data: id }) => {
    const guardian = requireGuardian()
    const mine = db.select({ h: apiTokens.tokenHash }).from(apiTokens).where(eq(apiTokens.guardianId, guardian.guardianId)).all()
    const hit = mine.find((r) => tokenHandle(r.h) === id)
    if (!hit) throw new Error('That token is already gone.')
    db.delete(apiTokens).where(and(eq(apiTokens.tokenHash, hit.h), eq(apiTokens.guardianId, guardian.guardianId))).run()
  })
