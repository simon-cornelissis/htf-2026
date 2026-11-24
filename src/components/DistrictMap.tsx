import { useNavigate } from '@tanstack/react-router'
import { useId, useMemo } from 'react'
import { DISTRICT_IDS, DISTRICTS, type DistrictId } from '#/lib/districts.ts'
import type { Glitch, GlitchStatus } from '#/lib/glitch.ts'
import type { DistrictMood } from '#/lib/operations.ts'
import type { Incident } from '#/lib/incidents.ts'
import { siteOnWorld, WORLD_METRES_PER_UNIT } from '#/lib/cityplan.ts'
import { IncidentLayer, type FxFocus } from '#/components/fx/IncidentLayer.tsx'

export type DistrictStats = { open: number; leaked: number; total: number }

export function districtStats(glitches: Pick<Glitch, 'district' | 'status'>[]) {
  const stats = Object.fromEntries(
    DISTRICT_IDS.map((id) => [id, { open: 0, leaked: 0, total: 0 }]),
  ) as Record<DistrictId, DistrictStats>
  for (const g of glitches) {
    const s = stats[g.district]
    if (!s) continue
    s.total++
    if (g.status !== 'FIXED') s.open++
    if (g.status === 'LEAKED') s.leaked++
  }
  return stats
}

const MARKER_FILL: Record<GlitchStatus, string> = {
  LEAKED: '#ff3a22',
  ASSESSING: '#ffb22e',
  CONTAINING: '#6dff55',
  FIXED: '#5a5a48',
}

// Fixed decoration, so server and client render the same thing.
// Rooftops seen from above: [x, y, w, h].
const ROOFS: [number, number, number, number][] = [
  [200, 140, 30, 18], [235, 150, 16, 22], [360, 118, 22, 20], [452, 88, 34, 14], [500, 96, 14, 14],
  [636, 116, 20, 24], [760, 206, 30, 16], [796, 220, 14, 14], [176, 316, 18, 26], [258, 418, 30, 14],
  [430, 244, 24, 16], [556, 376, 20, 20], [686, 326, 34, 16], [820, 376, 22, 18], [298, 536, 30, 14],
  [520, 536, 24, 18], [650, 542, 28, 14], [378, 466, 18, 18], [846, 296, 18, 16], [600, 232, 16, 20],
]
const SCRUB: [number, number][] = [
  [150, 210], [330, 250], [560, 260], [470, 400], [612, 300], [240, 478], [705, 520], [878, 336],
  [410, 160], [128, 414], [780, 136], [556, 128], [300, 360], [690, 440], [420, 540], [840, 250],
]

export function DistrictMap({
  glitches,
  selected,
  onSelect,
  onHover,
  highlight,
  focusGlitchId,
  compact = false,
  overlay = 'glitches',
  moods,
  onZoom,
  incidents,
  fxFocus,
  now,
}: {
  glitches: Glitch[]
  /** Pick mode (e.g. the transmit dialog): the district currently picked. */
  selected?: DistrictId
  onSelect?: (id: DistrictId | undefined) => void
  onHover?: (id: DistrictId | null) => void
  /** Static mode: the one district to point at. */
  highlight?: DistrictId
  focusGlitchId?: string
  compact?: boolean
  /** What the district colouring shows: glitch threat or resident fear. */
  overlay?: 'glitches' | 'mood'
  moods?: Record<DistrictId, DistrictMood>
  /** Zoom mode (world map): a click, Enter or Space on a district enters it. */
  onZoom?: (id: DistrictId) => void
  /** Recent incidents, drawn at their landmarks with a fading effect. */
  incidents?: Incident[]
  fxFocus?: FxFocus
  /** Clock for fading the effects. */
  now?: number
}) {
  const navigate = useNavigate()
  // Unique SVG ids: several maps can be on one page (board + dialog).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const stats = useMemo(() => districtStats(glitches), [glitches])
  const openByDistrict = useMemo(() => {
    const map = Object.fromEntries(DISTRICT_IDS.map((id) => [id, [] as Glitch[]])) as Record<DistrictId, Glitch[]>
    for (const g of glitches) if (g.status !== 'FIXED' || g.glitchId === focusGlitchId) map[g.district]?.push(g)
    return map
  }, [glitches, focusGlitchId])

  const zoomMode = Boolean(onZoom)
  const interactive = zoomMode || Boolean(onSelect)
  const pointAt = selected ?? highlight
  const activate = (id: DistrictId) => {
    if (onZoom) onZoom(id)
    else onSelect?.(selected === id ? undefined : id)
  }
  const ref = (name: string) => `url(#${uid}${name})`

  return (
    <svg
      viewBox="0 0 1000 640"
      className="block h-auto w-full select-none"
      role={interactive ? 'group' : 'img'}
      aria-label={
        zoomMode
          ? 'Map of Achrona. Pick a district to enter it.'
          : interactive
            ? 'Map of Achrona. Pick a district.'
            : `Map of Achrona, ${highlight ? DISTRICTS[highlight].name : ''} marked`
      }
    >
      <defs>
        <filter id={`${uid}erode`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="18" />
        </filter>
        {/* 4x4 ordered dither in sand tones */}
        <pattern id={`${uid}dither`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#8f7a4c" />
          <rect width="3" height="3" fill="#a08a58" />
          <rect x="3" y="3" width="3" height="3" fill="#a08a58" />
        </pattern>
        <pattern id={`${uid}dirt`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#3a301c" />
          <rect width="3" height="3" fill="#43381f" />
          <rect x="3" y="3" width="3" height="3" fill="#43381f" />
        </pattern>
        <pattern id={`${uid}waste`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#6e5c39" />
          <rect width="3" height="3" fill="#77643e" />
          <rect x="3" y="3" width="3" height="3" fill="#77643e" />
        </pattern>
        <pattern id={`${uid}grid`} width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
        </pattern>
        <pattern id={`${uid}hatch-red`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="12" fill="#8a2416" opacity="0.65" />
        </pattern>
        <pattern id={`${uid}hatch-amber`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="3" height="12" fill="#c9861a" opacity="0.5" />
        </pattern>
      </defs>

      <g shapeRendering="crispEdges">
        {/* Dirt and survey grid */}
        <rect width="1000" height="640" fill={ref('dirt')} />
        <rect width="1000" height="640" fill={ref('grid')} />
      </g>

      {/* Wasteland around the city */}
      <path
        d="M90 110 C160 40 420 20 600 30 S900 60 930 220 S960 470 800 560 S420 640 230 610 S50 520 60 360 S40 170 90 110Z"
        fill={ref('waste')}
        stroke="#2a2214"
        strokeWidth="4"
        filter={ref('erode')}
      />

      {/* Districts */}
      <g shapeRendering="crispEdges">
        {DISTRICT_IDS.map((id) => {
          const d = DISTRICTS[id]
          const s = stats[id]
          // In zoom mode nothing is dimmed: every district is a door.
          const dim = !zoomMode && pointAt && pointAt !== id
          return (
            <g key={id} opacity={dim ? 0.55 : 1}>
              <polygon points={d.points} fill={ref('dither')} stroke="#2a2214" strokeWidth="4" strokeLinejoin="bevel" />
              {overlay === 'glitches' && s.leaked > 0 && <polygon points={d.points} fill={ref('hatch-red')} />}
              {overlay === 'glitches' && s.leaked === 0 && s.open > 0 && <polygon points={d.points} fill={ref('hatch-amber')} />}
              {overlay === 'mood' && moods && (
                <polygon points={d.points} fill={moodFill(moods[id].fear)} opacity={0.25 + (moods[id].fear / 100) * 0.6} />
              )}
            </g>
          )
        })}
      </g>

      {/* River */}
      <g aria-hidden="true">
        <path d="M20 330 C180 300 260 390 380 345 S560 255 660 330 S820 440 990 415" fill="none" stroke="#14100a" strokeWidth="30" />
        <path d="M20 330 C180 300 260 390 380 345 S560 255 660 330 S820 440 990 415" fill="none" stroke="#1f3534" strokeWidth="22" />
        <path d="M20 330 C180 300 260 390 380 345 S560 255 660 330 S820 440 990 415" fill="none" stroke="#3f6360" strokeWidth="3" strokeDasharray="6 18" />
      </g>

      {/* Roads, rooftops, scrub */}
      <g aria-hidden="true" shapeRendering="crispEdges">
        <g fill="none" stroke="#5a4a2c" strokeWidth="6" strokeDasharray="12 6">
          <path d="M270 180 L480 130 L720 170 L770 360 L590 500 L325 505 L215 370 Z" />
          <path d="M480 130 L500 330 L590 500 M215 370 L500 330 L770 360" />
        </g>
        {ROOFS.map(([x, y, w, h], i) => (
          <g key={i}>
            <rect x={x + 4} y={y + 4} width={w} height={h} fill="#000" opacity="0.35" />
            <rect x={x} y={y} width={w} height={h} fill={i % 3 === 0 ? '#6a3a26' : '#4a4234'} stroke="#1a140a" strokeWidth="2" />
            <rect x={x + 2} y={y + 2} width={w - 4} height="3" fill="#fff" opacity="0.12" />
          </g>
        ))}
        {SCRUB.map(([x, y], i) => (
          <g key={i} fill="#4d5626">
            <rect x={x} y={y} width="8" height="6" />
            <rect x={x + 6} y={y - 4} width="6" height="6" fill="#5d6a2c" />
            <rect x={x - 6} y={y + 4} width="6" height="4" />
          </g>
        ))}
      </g>

      {/* Incidents at their landmarks: blasts, smoke, fog... fading over two days */}
      {incidents && incidents.length > 0 && (
        <IncidentLayer
          incidents={incidents}
          now={now ?? Date.now()}
          position={siteOnWorld}
          metresPerUnit={WORLD_METRES_PER_UNIT}
          u={2}
          focus={fxFocus}
        />
      )}

      {/* Selection / highlight outline */}
      {pointAt && (
        <polygon
          points={DISTRICTS[pointAt].points}
          fill="none"
          stroke="#ffb22e"
          strokeWidth={zoomMode ? 3 : 5}
          strokeDasharray="16 8"
          strokeOpacity={zoomMode ? 0.7 : 1}
          shapeRendering="crispEdges"
          pointerEvents="none"
        />
      )}

      {/* Hit areas + labels */}
      {DISTRICT_IDS.map((id) => {
        const d = DISTRICTS[id]
        const s = stats[id]
        const [cx, cy] = d.center
        const isSelected = selected === id
        const summary = `${s.open} open ${s.open === 1 ? 'glitch' : 'glitches'}${s.leaked ? `, ${s.leaked} leaked` : ''}`
        return (
          <g
            key={id}
            role={zoomMode ? 'link' : interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={zoomMode ? `Enter ${d.name}: ${summary}` : interactive ? `${d.name}: ${summary}` : undefined}
            aria-pressed={interactive && !zoomMode ? isSelected : undefined}
            className={
              interactive
                ? 'group/d cursor-pointer outline-none [&:focus-visible>.hit]:stroke-[#ffb22e] [&:hover>.hit]:stroke-[#ffb22e] [&>.hit]:transition-[fill] [&:hover>.hit]:fill-[rgb(255_240_190/0.14)] [&:focus-visible>.hit]:fill-[rgb(255_240_190/0.14)]'
                : undefined
            }
            onClick={interactive ? () => activate(id) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      activate(id)
                    }
                  }
                : undefined
            }
            onPointerEnter={() => onHover?.(id)}
            onPointerLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(id)}
            onBlur={() => onHover?.(null)}
          >
            <polygon className="hit" points={d.points} fill="transparent" stroke="transparent" strokeWidth="6" strokeLinejoin="bevel" shapeRendering="crispEdges" />
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fill="#f4e8bb"
              stroke="#140f07"
              strokeWidth="6"
              paintOrder="stroke"
              style={{ fontFamily: 'var(--font-pixel)', fontWeight: 700, fontSize: compact ? 26 : 22, textTransform: 'uppercase' }}
              pointerEvents="none"
            >
              {d.name}
            </text>
            {!compact && overlay === 'mood' && moods && (
              <text
                x={cx}
                y={cy + 34}
                textAnchor="middle"
                fill={moods[id].fear >= 40 ? '#ff6a4e' : '#9dff86'}
                stroke="#140f07"
                strokeWidth="5"
                paintOrder="stroke"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 24 }}
                pointerEvents="none"
              >
                {`FEAR ${moods[id].fear} · JOY ${moods[id].happiness}`}
              </text>
            )}
            {!compact && overlay === 'glitches' && (
              <text
                x={cx}
                y={cy + 34}
                textAnchor="middle"
                fill={s.leaked ? '#ff6a4e' : s.open ? '#ffb22e' : '#9dff86'}
                stroke="#140f07"
                strokeWidth="5"
                paintOrder="stroke"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 26 }}
                pointerEvents="none"
              >
                {s.open ? `${s.open} OPEN` : 'STABLE'}
              </text>
            )}
            {zoomMode && (
              <g
                aria-hidden="true"
                pointerEvents="none"
                className="opacity-0 group-hover/d:opacity-100 group-focus-visible/d:opacity-100"
                shapeRendering="crispEdges"
              >
                <rect x={cx - 62} y={cy + 46} width="124" height="30" fill="#140f07" stroke="#ffb22e" strokeWidth="3" />
                <text
                  x={cx}
                  y={cy + 68}
                  textAnchor="middle"
                  fill="#ffb22e"
                  style={{ fontFamily: 'var(--font-pixel)', fontWeight: 700, fontSize: 18, textTransform: 'uppercase' }}
                >
                  Enter ▸
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Glitch markers: square pixel beacons above each label */}
      <g shapeRendering="crispEdges">
        {DISTRICT_IDS.flatMap((id) => {
          const list = openByDistrict[id]
          const [cx, cy] = DISTRICTS[id].center
          return list.map((g, i) => {
            const x = cx + (i - (list.length - 1) / 2) * 30
            const y = cy - 34
            const focused = g.glitchId === focusGlitchId
            const size = focused ? 22 : 16
            return (
              <g
                key={g.glitchId}
                aria-hidden="true"
                className={compact ? undefined : 'cursor-pointer'}
                onClick={
                  compact
                    ? undefined
                    : (e) => {
                        e.stopPropagation()
                        navigate({ to: '/glitches/$glitchId', params: { glitchId: g.glitchId } })
                      }
                }
              >
                <title>{`${g.glitchId} · ${g.status} · ${g.description}`}</title>
                {(focused || g.status === 'LEAKED') && (
                  <rect x={x - size / 2 - 6} y={y - size / 2 - 6} width={size + 12} height={size + 12} fill="none" stroke={focused ? '#ffb22e' : '#ff3a22'} strokeWidth="3" className="animate-blink" />
                )}
                <rect x={x - size / 2} y={y - size / 2} width={size} height={size} fill={MARKER_FILL[g.status]} stroke="#140f07" strokeWidth="3" />
                <rect x={x - size / 2 + 3} y={y - size / 2 + 3} width="4" height="4" fill="#fff" opacity="0.6" />
              </g>
            )
          })
        })}
      </g>

      {/* Map furniture */}
      {!compact && (
        <g aria-hidden="true" style={{ fontFamily: 'var(--font-pixel)', fontSize: 14 }} fill="#d8c890" shapeRendering="crispEdges">
          {Array.from({ length: 10 }, (_, i) => (
            <text key={`c${i}`} x={i * 100 + 50} y="20" textAnchor="middle">{String.fromCharCode(65 + i)}</text>
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <text key={`r${i}`} x="10" y={i * 100 + 70}>{i + 1}</text>
          ))}
          {/* compass */}
          <g transform="translate(930 560)">
            <rect x="-30" y="-30" width="60" height="60" fill="#1a140a" stroke="#d8c890" strokeWidth="2" />
            <path d="M0 -24 L8 0 L0 24 L-8 0Z" fill="#d8c890" />
            <path d="M0 -24 L8 0 L-8 0Z" fill="#ff3a22" />
            <text y="-38" textAnchor="middle">N</text>
          </g>
          {/* scale */}
          <g transform="translate(40 604)">
            <rect width="60" height="8" fill="#d8c890" />
            <rect x="60" width="60" height="8" fill="#1a140a" stroke="#d8c890" strokeWidth="2" />
            <text y="-8">0</text>
            <text x="104" y="-8">2KM</text>
          </g>
          {/* origin marker */}
          <g transform="translate(96 566)">
            <rect x="-6" y="-20" width="180" height="28" fill="#1a140a" stroke="#ffb22e" strokeWidth="2" />
            <text x="84" y="0" textAnchor="middle" fill="#ffb22e">DESYNC ORIGIN</text>
            <path d="M174 -6 H196 V-40" fill="none" stroke="#ffb22e" strokeWidth="3" />
            <path d="M188 -34 L196 -44 L204 -34" fill="none" stroke="#ffb22e" strokeWidth="3" />
          </g>
        </g>
      )}
    </svg>
  )
}

/** Calm districts stay sand; frightened ones go deep red. */
function moodFill(fear: number) {
  if (fear >= 60) return '#7a0f08'
  if (fear >= 40) return '#a3301a'
  if (fear >= 25) return '#b8762a'
  return '#4f6a2a'
}
