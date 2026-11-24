// Server-only: personal access tokens for the MCP endpoint.
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { apiTokens, guardians } from '#/db/schema.ts'
import type { Guardian } from '#/lib/glitch.ts'

/** Recognisable prefix, so a leaked token is easy to spot in logs or a repo. */
export const TOKEN_PREFIX = 'achrona_pat_'

/** Only the sha256 of a token is ever stored. The plain token is shown once. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

/** Short, non-secret handle for a token in lists (first chars of its hash). */
export const tokenHandle = (tokenHash: string) => tokenHash.slice(0, 12)

/**
 * Resolve a bearer token to the guardian it belongs to, and stamp lastUsedAt.
 * Returns null for unknown or malformed tokens. Never logs the token.
 */
export function guardianForToken(token: string): Guardian | null {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null
  const tokenHash = hashToken(token)
  const row = db
    .select({ guardianId: guardians.guardianId, codename: guardians.codename, role: guardians.role })
    .from(apiTokens)
    .innerJoin(guardians, eq(apiTokens.guardianId, guardians.guardianId))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .get()
  if (!row) return null
  db.update(apiTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiTokens.tokenHash, tokenHash)).run()
  return row
}
