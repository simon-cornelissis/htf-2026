import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm'
import { db } from '#/db/index.ts'
import { echoes, glitches, guardians, operations } from '#/db/schema.ts'
import { requireGuardian } from '#/lib/session.ts'
import { executeDueOperations, RELAY_GUARDIAN } from '#/lib/world.ts'

/** How defenders earn points. Shown on the leaderboard so the rules are clear. */
export const SCORING = {
  echo: { points: 10, label: 'Echo reported' },
  opened: { points: 15, label: 'First to report a glitch (bonus)' },
  fixed: { points: 25, label: 'Glitch you reported on got fixed' },
  defusal: { points: 100, label: 'Device defused (+1 per second left on the fuse)' },
} as const

export type Badge = { id: string; label: string; hint: string }

export const BADGES = {
  hero: { id: 'hero', label: 'Bomb hero', hint: 'Defused a planted device.' },
  responder: { id: 'responder', label: 'First responder', hint: 'First to report 3 or more glitches.' },
  voice: { id: 'voice', label: 'Loud signal', hint: 'Reported 10 or more echoes.' },
  closer: { id: 'closer', label: 'Closer', hint: 'Helped 3 or more glitches get fixed.' },
} satisfies Record<string, Badge>

export type LeaderboardRow = {
  rank: number
  guardianId: string
  codename: string
  points: number
  echoes: number
  opened: number
  fixesHelped: number
  defusals: number
  /** Fastest defusal: most seconds left on the fuse. */
  bestDefuseSecondsLeft: number | null
  badges: Badge[]
}

/** Defenders ranked by points. Commanders and the civilian relay aren't ranked. */
export const getLeaderboard = createServerFn({ method: 'GET' }).handler(async (): Promise<LeaderboardRow[]> => {
  requireGuardian()
  executeDueOperations()

  const defenders = db
    .select({ guardianId: guardians.guardianId, codename: guardians.codename })
    .from(guardians)
    .where(and(eq(guardians.role, 'defender'), ne(guardians.guardianId, RELAY_GUARDIAN.guardianId)))
    .all()

  const allEchoes = db
    .select({ glitchId: echoes.glitchId, guardianId: echoes.reportingGuardianId, timestamp: echoes.timestamp, status: glitches.status })
    .from(echoes)
    .innerJoin(glitches, eq(echoes.glitchId, glitches.glitchId))
    .orderBy(asc(echoes.timestamp))
    .all()

  const defusals = db
    .select({ guardianId: operations.defusedBy, points: operations.defusePoints })
    .from(operations)
    .where(and(eq(operations.outcome, 'DEFUSED'), isNotNull(operations.defusedBy)))
    .all()

  // First echo per glitch = who opened it.
  const openedBy = new Map<string, string>()
  for (const e of allEchoes) if (!openedBy.has(e.glitchId)) openedBy.set(e.glitchId, e.guardianId)

  const rows = defenders.map((d) => {
    const mine = allEchoes.filter((e) => e.guardianId === d.guardianId)
    const opened = [...openedBy.values()].filter((g) => g === d.guardianId).length
    const fixesHelped = new Set(mine.filter((e) => e.status === 'FIXED').map((e) => e.glitchId)).size
    const myDefusals = defusals.filter((x) => x.guardianId === d.guardianId)
    const defusePoints = myDefusals.reduce((s, x) => s + (x.points ?? 0), 0)
    const points =
      mine.length * SCORING.echo.points + opened * SCORING.opened.points + fixesHelped * SCORING.fixed.points + defusePoints
    const best = myDefusals.length ? Math.max(...myDefusals.map((x) => (x.points ?? 0) - SCORING.defusal.points)) : null

    const badges: Badge[] = []
    if (myDefusals.length > 0) badges.push(BADGES.hero)
    if (opened >= 3) badges.push(BADGES.responder)
    if (mine.length >= 10) badges.push(BADGES.voice)
    if (fixesHelped >= 3) badges.push(BADGES.closer)

    return {
      rank: 0,
      guardianId: d.guardianId,
      codename: d.codename,
      points,
      echoes: mine.length,
      opened,
      fixesHelped,
      defusals: myDefusals.length,
      bestDefuseSecondsLeft: best,
      badges,
    }
  })

  rows.sort((a, b) => b.points - a.points || a.codename.localeCompare(b.codename))
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1))
  return rows
})
