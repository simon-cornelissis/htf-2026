import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveBombs, getRecentBlasts, type ActiveBomb, type RecentBlast } from '#/lib/bombs.functions.ts'
import { DISTRICTS } from '#/lib/districts.ts'
import { countdown, useNow } from '#/lib/useNow.ts'

const POLL_MS = 5000

/** Alert strip shown to every signed-in guardian while a planted device is armed. */
export function BombAlert() {
  const [bombs, setBombs] = useState<ActiveBomb[]>([])
  const [blasts, setBlasts] = useState<RecentBlast[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const now = useNow(1000)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const [active, recent] = await Promise.all([getActiveBombs(), getRecentBlasts()])
      setBombs(active)
      setBlasts(recent)
    } catch {
      // Signed out or offline: keep quiet, try again on the next tick.
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // A fuse just ran out: ask again so the server settles it and the strip clears.
  const expired = bombs.some((b) => new Date(b.fuseEndsAt).getTime() <= now)
  useEffect(() => {
    if (expired) refresh()
  }, [expired, refresh])

  const news = blasts.filter((b) => !dismissed.has(b.glitchId))
  if (bombs.length === 0 && news.length === 0) return null

  return (
    <div role="alert" className="flex flex-col gap-2">
      {/* Just went off: the toll, for a few minutes. */}
      {news.map((b) => (
        <div key={`blast-${b.glitchId}`} className="metal overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#5a0d07] px-4 py-2">
            <span data-on="red" className="lamp size-5" aria-hidden="true" />
            <span className="font-pixel text-sm font-bold text-[#ffb09c] uppercase">Detonated</span>
            <span className="text-2xl leading-none text-[#ffd8cc]">
              {b.siteName}, {DISTRICTS[b.district]?.name ?? b.district}
            </span>
            <span className="readout px-2 text-2xl leading-tight">
              {b.casualties} dead · {b.injured} injured · {b.blastRadius} m
            </span>
            <span className="ml-auto flex gap-2">
              <Link to="/districts/$districtId" params={{ districtId: b.district }} className="btn px-4 py-1.5 text-xs">
                See the damage ▸
              </Link>
              <button
                type="button"
                onClick={() => setDismissed((d) => new Set(d).add(b.glitchId))}
                className="btn px-2.5 py-1.5 text-xs"
                aria-label="Dismiss this alert"
              >
                ✕
              </button>
            </span>
          </div>
        </div>
      ))}
      {bombs.map((b) => {
        const left = new Date(b.fuseEndsAt).getTime() - now
        const critical = left < 30_000
        return (
          <div key={b.glitchId} className="metal overflow-hidden">
            <div className="hazard h-2" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
              <span data-on="red" className="lamp size-5 animate-blink" aria-hidden="true" />
              <span className="font-pixel text-sm font-bold text-[#ff7a5c] uppercase animate-flicker">Device armed</span>
              <span className="text-2xl leading-none text-stamp">
                {b.siteName}, {DISTRICTS[b.district]?.name ?? b.district}
              </span>
              <span
                className={`readout px-2 text-2xl leading-tight ${critical ? 'animate-blink text-[#ff3b1f]' : ''}`}
                aria-label={`Time left ${countdown(b.fuseEndsAt, now)}`}
                suppressHydrationWarning
              >
                T-{countdown(b.fuseEndsAt, now)}
              </span>
              <Link
                to="/bombs/$glitchId"
                params={{ glitchId: b.glitchId }}
                className="btn ml-auto px-4 py-1.5 text-xs"
              >
                Defuse now ▸
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
