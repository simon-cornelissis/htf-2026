import { createServerFn } from '@tanstack/react-start'
import { eq, sql } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { guardians } from '#/db/schema.ts'
import type { Guardian } from '#/lib/glitch.ts'
import { verifyPassword } from '#/lib/password.ts'
import { currentGuardian, endSession, startSession } from '#/lib/session.ts'

export const getMe = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Guardian | null> => currentGuardian(),
)

export const login = createServerFn({ method: 'POST' })
  .validator((input: { codename: string; password: string }) => ({
    codename: String(input.codename ?? '').trim(),
    password: String(input.password ?? ''),
  }))
  .handler(async ({ data }): Promise<Guardian> => {
    const row = db
      .select()
      .from(guardians)
      .where(eq(sql`upper(${guardians.codename})`, data.codename.toUpperCase()))
      .get()
    // Same message for unknown codename and wrong password: don't leak which one.
    if (!row || !verifyPassword(data.password, row.passwordHash)) {
      throw new Error('Codename or passphrase is wrong.')
    }
    startSession(row.guardianId)
    return { guardianId: row.guardianId, codename: row.codename, role: row.role }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  endSession()
})
