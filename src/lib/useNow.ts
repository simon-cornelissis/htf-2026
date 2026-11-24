import { useEffect, useState } from 'react'

/** Current time, re-rendering every `ms`. Starts at 0 on the server to avoid hydration drift. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** "12:05" style countdown, or "NOW" once it's due. */
export function countdown(targetIso: string, now: number) {
  const s = Math.max(0, Math.round((new Date(targetIso).getTime() - now) / 1000))
  if (s === 0) return 'NOW'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
