import { useId } from 'react'
import { IncidentLayer, type FxFocus } from '#/components/fx/IncidentLayer.tsx'
import { cityPlan, PLAN_H, PLAN_METRES_PER_UNIT, PLAN_W } from '#/lib/cityplan.ts'
import { DISTRICTS, parseSiteId, SITE_META, SITE_TYPES, siteId as makeSiteId, type DistrictId, type Mood, type SiteType } from '#/lib/districts.ts'
import type { GlitchStatus } from '#/lib/glitch.ts'
import { harmLine, type Incident } from '#/lib/incidents.ts'

/** 12x12 pixel icons per landmark. # = main colour, + = accent. */
const ICONS: Record<SiteType, { art: string[]; main: string; accent: string }> = {
  station: {
    main: '#c9c4a0',
    accent: '#ffb22e',
    art: [
      '............',
      '..########..',
      '.#........#.',
      '.#.++..++.#.',
      '.#.++..++.#.',
      '.#........#.',
      '.##########.',
      '.#.######.#.',
      '..##....##..',
      '.#........#.',
      '############',
      '............',
    ],
  },
  school: {
    main: '#e9cf66',
    accent: '#ff5a4a',
    art: [
      '.....+......',
      '.....++.....',
      '.....#......',
      '....###.....',
      '...#####....',
      '..#######...',
      '.#########..',
      '.#.#.#.#.#..',
      '.#.#.#.#.#..',
      '.#########..',
      '.###.#.###..',
      '.###...###..',
    ],
  },
  hospital: {
    main: '#e8e4d0',
    accent: '#ff3a22',
    art: [
      '............',
      '.##########.',
      '.#........#.',
      '.#...++...#.',
      '.#...++...#.',
      '.#.++++++.#.',
      '.#.++++++.#.',
      '.#...++...#.',
      '.#...++...#.',
      '.#........#.',
      '.##########.',
      '............',
    ],
  },
  square: {
    main: '#b8b090',
    accent: '#6fd0ff',
    art: [
      '............',
      '.....++.....',
      '....+..+....',
      '.....++.....',
      '..########..',
      '.#++++++++#.',
      '.#+######+#.',
      '.#++++++++#.',
      '..########..',
      '....#..#....',
      '...##..##...',
      '............',
    ],
  },
  mall: {
    main: '#d89a4a',
    accent: '#ff5a4a',
    art: [
      '............',
      '++++++++++++',
      '+#+#+#+#+#+#',
      '++++++++++++',
      '.#........#.',
      '.#.##..##.#.',
      '.#.##..##.#.',
      '.#........#.',
      '.#..####..#.',
      '.#..#..#..#.',
      '.##########.',
      '............',
    ],
  },
}

export function SiteIcon({ type, size = 48 }: { type: SiteType; size?: number }) {
  const icon = ICONS[type]
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {icon.art.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={ch === '#' ? icon.main : icon.accent} />,
        ),
      )}
    </svg>
  )
}

const RIVER = 'M20 330 C180 300 260 390 380 345 S560 255 660 330 S820 440 990 415'

export type SiteIncident = { siteId: string; status: GlitchStatus | 'PLANNED_OP' }

/**
 * Zoomed-in plan of one district: streets, rooftops, the five landmarks,
 * and residents walking around. The more afraid people are, the fewer go out.
 */
export function CityPlan({
  district,
  mood,
  incidents,
  selected,
  onSelect,
  attacks,
  fxFocus,
  now,
}: {
  district: DistrictId
  mood: Mood
  incidents: SiteIncident[]
  /** Recent incidents in this district, drawn with their effect and radius. */
  attacks?: Incident[]
  fxFocus?: FxFocus
  now?: number
  selected?: SiteType
  onSelect: (site: SiteType) => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const plan = cityPlan(district)
  const outline = plan.outline.map((p) => p.join(',')).join(' ')
  // Fear keeps people indoors: at 0 fear everyone's out, at 80+ the streets are nearly empty.
  const outside = Math.round(plan.walkers.length * Math.max(0.08, 1 - mood.fear / 85))
  const walkerColor = mood.fear >= 50 ? '#ff8a6a' : mood.fear >= 30 ? '#ffd27a' : '#e9f5c8'
  const attacksHere = (attacks ?? []).filter((a) => a.district === district)
  const position = (d: DistrictId, t: SiteType) => (d === district ? plan.sites[t] : null)
  const clock = now ?? Date.now()
  const marked = fxFocus?.highlight ? attacksHere.find((a) => a.key === fxFocus.highlight) : undefined
  const markedSite = marked ? parseSiteId(marked.siteId) : null

  return (
    <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} className="block h-auto w-full select-none" role="group" aria-label={`City plan of ${DISTRICTS[district].name}. Pick a landmark.`}>
      <defs>
        <clipPath id={`${uid}clip`}>
          <polygon points={outline} />
        </clipPath>
        <pattern id={`${uid}ground`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#8f7a4c" />
          <rect width="3" height="3" fill="#a08a58" />
          <rect x="3" y="3" width="3" height="3" fill="#a08a58" />
        </pattern>
        <pattern id={`${uid}dirt`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#2e2616" />
          <rect width="3" height="3" fill="#362d1a" />
          <rect x="3" y="3" width="3" height="3" fill="#362d1a" />
        </pattern>
      </defs>

      <rect width={PLAN_W} height={PLAN_H} fill={`url(#${uid}dirt)`} />

      <g shapeRendering="crispEdges">
        <polygon points={outline} fill={`url(#${uid}ground)`} stroke="#1a140a" strokeWidth="8" />
        <g clipPath={`url(#${uid}clip)`}>
          {/* Streets */}
          {plan.streetsX.map((x) => (
            <g key={`sx${x}`}>
              <rect x={x - 9} y={0} width={18} height={PLAN_H} fill="#4a3d26" />
              <rect x={x - 1} y={0} width={2} height={PLAN_H} fill="#6e5c39" />
            </g>
          ))}
          {plan.streetsY.map((y) => (
            <g key={`sy${y}`}>
              <rect x={0} y={y - 9} width={PLAN_W} height={18} fill="#4a3d26" />
              <rect x={0} y={y - 1} width={PLAN_W} height={2} fill="#6e5c39" />
            </g>
          ))}
          {/* River, mapped from the world map */}
          <g transform={plan.worldTransform}>
            <path d={RIVER} fill="none" stroke="#14100a" strokeWidth="30" />
            <path d={RIVER} fill="none" stroke="#1f3534" strokeWidth="22" />
            <path d={RIVER} fill="none" stroke="#3f6360" strokeWidth="3" strokeDasharray="6 18" />
          </g>
          {/* Rooftops */}
          {plan.roofs.map((r, i) => (
            <g key={i}>
              <rect x={r.x + 3} y={r.y + 3} width={r.w} height={r.h} fill="#000" opacity="0.35" />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={['#4a4234', '#6a3a26', '#5a5240'][r.tone]} stroke="#1a140a" strokeWidth="2" />
              <rect x={r.x + 2} y={r.y + 2} width={r.w - 4} height="2" fill="#fff" opacity="0.12" />
            </g>
          ))}
        </g>
      </g>

      {/* Incident ground marks: scorch, stains, rubble and the affected radius */}
      {attacksHere.length > 0 && (
        <g clipPath={`url(#${uid}clip)`}>
          <IncidentLayer incidents={attacksHere} now={clock} position={position} metresPerUnit={PLAN_METRES_PER_UNIT} u={4} showRadius focus={fxFocus} layer="ground" />
        </g>
      )}

      {/* Residents */}
      <g aria-hidden="true" shapeRendering="crispEdges">
        {plan.walkers.slice(0, outside).map((w, i) => (
          <rect
            key={i}
            x={w.x - 3}
            y={w.y - 3}
            width="6"
            height="6"
            fill={walkerColor}
            stroke="#140f07"
            strokeWidth="1.5"
            style={{
              animation: `${w.axis === 'x' ? 'walk-x' : 'walk-y'} ${w.speed}s steps(10) ${w.delay}s infinite alternate`,
            }}
          />
        ))}
      </g>

      {/* Landmarks */}
      {SITE_TYPES.map((type) => {
        const [x, y] = plan.sites[type]
        const id = makeSiteId(district, type)
        const here = incidents.filter((i) => i.siteId === id)
        const leaked = here.some((i) => i.status === 'LEAKED')
        const open = here.some((i) => i.status !== 'FIXED' && i.status !== 'PLANNED_OP')
        const planned = here.some((i) => i.status === 'PLANNED_OP')
        const isSelected = selected === type
        const name = DISTRICTS[district].sites[type]
        return (
          <g
            key={type}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${SITE_META[type].label}: ${name}${open ? ', incident reported' : ''}`}
            className="landmark cursor-pointer outline-none [&:focus-visible_.plate]:stroke-[#ffb22e] [&:hover_.plate]:stroke-[#ffb22e]"
            onClick={() => onSelect(type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(type)
              }
            }}
          >
            {(leaked || isSelected) && (
              <rect
                key={isSelected ? 'sel' : 'leak'}
                x={x - 42}
                y={y - 42}
                width="84"
                height="84"
                fill="none"
                stroke={isSelected ? '#ffb22e' : '#ff3a22'}
                strokeWidth="4"
                strokeDasharray={isSelected ? '12 6' : undefined}
                className={leaked && !isSelected ? 'animate-blink' : 'fade-in'}
                shapeRendering="crispEdges"
              />
            )}
            <rect className="plate" x={x - 34} y={y - 34} width="68" height="68" fill="#1a140a" stroke="#5a5240" strokeWidth="3" shapeRendering="crispEdges" />
            <g transform={`translate(${x - 24} ${y - 24})`}>
              <SiteIcon type={type} />
            </g>
            {open && <rect className="fade-in" x={x + 20} y={y - 40} width="18" height="18" fill={leaked ? '#ff3a22' : '#ffb22e'} stroke="#140f07" strokeWidth="3" shapeRendering="crispEdges" />}
            {planned && (
              <g className="fade-in" shapeRendering="crispEdges">
                <rect x={x - 40} y={y - 40} width="22" height="18" fill="#0b0703" stroke="#ffb22e" strokeWidth="2" />
                <text x={x - 29} y={y - 26} textAnchor="middle" fill="#ffb22e" style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>OP</text>
              </g>
            )}
            <text
              x={x}
              y={y + 56}
              textAnchor="middle"
              fill={isSelected ? '#ffb22e' : '#f4e8bb'}
              className="map-fill"
              stroke="#140f07"
              strokeWidth="6"
              paintOrder="stroke"
              style={{ fontFamily: 'var(--font-pixel)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase' }}
            >
              {name}
            </text>
            <text
              x={x}
              y={y + 76}
              textAnchor="middle"
              fill="#c8c49a"
              stroke="#140f07"
              strokeWidth="5"
              paintOrder="stroke"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 20 }}
            >
              {SITE_META[type].label.toUpperCase()}
            </text>
          </g>
        )
      })}
      {/* Incident smoke, flames, fog: above the landmarks */}
      {attacksHere.length > 0 && (
        <IncidentLayer incidents={attacksHere} now={clock} position={position} metresPerUnit={PLAN_METRES_PER_UNIT} u={4} focus={fxFocus} layer="air" />
      )}
      {marked && markedSite && (
        <IncidentTag key={marked.key} incident={marked} at={plan.sites[markedSite.type]} />
      )}
    </svg>
  )
}

/** Readout next to the highlighted incident: what, how bad, how far. */
function IncidentTag({ incident, at: [x, y] }: { incident: Incident; at: [number, number] }) {
  const line = `${incident.label.toUpperCase()} · ${harmLine(incident).toUpperCase()}${incident.radius ? ` · R ${incident.radius} M` : ''}`
  const w = Math.max(160, line.length * 10 + 20)
  // Keep it on the plan: flip to the left near the right edge.
  const left = x + 50 + w > PLAN_W - 8
  const tx = left ? x - 50 - w : x + 50
  const ty = Math.max(8, Math.min(PLAN_H - 40, y - 90))
  return (
    <g className="fade-in" pointerEvents="none" aria-hidden="true" shapeRendering="crispEdges">
      <rect x={tx} y={ty} width={w} height="32" fill="#0b0703" stroke="#ffb22e" strokeWidth="3" />
      <text x={tx + w / 2} y={ty + 23} textAnchor="middle" fill="#ffb22e" style={{ fontFamily: 'var(--font-mono)', fontSize: 22 }}>
        {line}
      </text>
    </g>
  )
}
