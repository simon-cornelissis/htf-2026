import { useEffect, useState } from 'react'
import { parseSiteId, type DistrictId, type SiteType } from '#/lib/districts.ts'
import { fxPhase, harmLine, type Incident } from '#/lib/incidents.ts'
import { IncidentFx } from './IncidentFx.tsx'

/** Which incident is highlighted, and replay counters per incident key. */
export type FxFocus = { highlight?: string | null; replays?: Record<string, number> }

/**
 * All incident effects for one map, oldest at the bottom. Rendered only in
 * the browser: the effects depend on the clock, which differs from the server.
 */
export function IncidentLayer({
  incidents,
  now,
  position,
  metresPerUnit,
  u,
  showRadius = false,
  focus,
  layer = 'all',
}: {
  layer?: 'ground' | 'air' | 'all'
  incidents: Incident[]
  now: number
  /** Where a landmark sits in this SVG, or null to skip it. */
  position: (district: DistrictId, site: SiteType) => [number, number] | null
  metresPerUnit: number
  u: number
  showRadius?: boolean
  focus?: FxFocus
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const list = [...incidents].sort((a, b) => (a.at < b.at ? -1 : 1))
  return (
    <g aria-hidden="true">
      {list.map((i) => {
        const site = parseSiteId(i.siteId)
        if (!site) return null
        const at = position(site.district, site.type)
        if (!at) return null
        const replay = focus?.replays?.[i.key] ?? 0
        const phase = fxPhase(i.at, now)
        const highlight = focus?.highlight === i.key
        // Spread incidents at the same site a little, so they don't stack exactly.
        const seed = hashKey(i.key)
        const jx = ((seed % 5) - 2) * u * 2
        const jy = (((seed >> 3) % 5) - 2) * u * 2
        return (
          <IncidentFx
            key={`${i.key}:${replay}`}
            fx={i.fx}
            x={at[0] + jx}
            y={at[1] + jy}
            r={i.radius / metresPerUnit}
            u={u}
            phase={phase}
            seed={seed}
            replay={replay > 0}
            showRadius={showRadius}
            highlight={highlight}
            layer={layer}
            title={`${i.label} · ${i.siteName} · ${harmLine(i)}`}
          />
        )
      })}
    </g>
  )
}

function hashKey(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
