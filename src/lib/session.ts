// Server-only helpers, called from inside server function handlers.
import { randomBytes } from 'node:crypto'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { guardians, sessions } from '#/db/schema.ts'
import type { Guardian } from '#/lib/glitch.ts'

const COOKIE = 'achrona_session'
const SESSION_DAYS = 7

export function startSession(guardianId: string) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  db.insert(sessions)
    .values({ token, guardianId, expiresAt: expires.toISOString() })
    .run()
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  })
}

export function endSession() {
  const token = getCookie(COOKIE)
  if (token) db.delete(sessions).where(eq(sessions.token, token)).run()
  deleteCookie(COOKIE, { path: '/' })
}

/** The signed-in guardian, or null. */
export function currentGuardian(): Guardian | null {
  const token = getCookie(COOKIE)
  if (!token) return null
  const row = db
    .select({
      guardianId: guardians.guardianId,
      codename: guardians.codename,
      role: guardians.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(guardians, eq(sessions.guardianId, guardians.guardianId))
    .where(eq(sessions.token, token))
    .get()
  if (!row) return null
  if (row.expiresAt < new Date().toISOString()) {
    db.delete(sessions).where(eq(sessions.token, token)).run()
    return null
  }
  return { guardianId: row.guardianId, codename: row.codename, role: row.role }
}

export function requireGuardian(): Guardian {
  const guardian = currentGuardian()
  if (!guardian) throw new Error('Your session expired. Sign in again.')
  return guardian
}

export function requireCommander(): Guardian {
  const guardian = requireGuardian()
  if (guardian.role !== 'commander') {
    throw new Error('Only commanders can do this.')
  }
  return guardian
}
