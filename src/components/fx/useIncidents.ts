import { useCallback, useEffect, useRef, useState } from 'react'
import type { DistrictId } from '#/lib/districts.ts'
import { getIncidents } from '#/lib/incidents.functions.ts'
import type { Incident } from '#/lib/incidents.ts'
import type { FxFocus } from './IncidentLayer.tsx'

const POLL_MS = 20_000
/** How long a replay keeps an old incident looking fresh. */
const REPLAY_MS = 8_000

/**
 * Incidents for a map + history panel: starts from the loader data, then
 * polls so new attacks show up without a reload. Also holds which incident
 * is highlighted and which ones are replaying.
 */
export function useIncidents(initial: Incident[], district?: DistrictId) {
  const [incidents, setIncidents] = useState(initial)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [replays, setReplays] = useState<Record<string, number>>({})
  const busy = useRef(false)

  useEffect(() => setIncidents(initial), [initial])

  useEffect(() => {
    const id = setInterval(async () => {
      if (busy.current || document.hidden) return
      busy.current = true
      try {
        setIncidents(await getIncidents({ data: { district } }))
      } catch {
        // Offline or signed out: keep what we have.
      } finally {
        busy.current = false
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [district])

  const replay = useCallback((key: string) => {
    setReplays((r) => ({ ...r, [key]: (r[key] ?? 0) + 1 }))
    setTimeout(() => {
      setReplays((r) => {
        const next = { ...r }
        delete next[key]
        return next
      })
    }, REPLAY_MS)
  }, [])

  const focus: FxFocus = { highlight: hovered ?? pinned, replays }
  return { incidents, focus, hovered, setHovered, pinned, setPinned, replay }
}
