import { Link } from '@tanstack/react-router'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { DISTRICTS } from '#/lib/districts.ts'
import { harmLine, totalsToday, type Incident } from '#/lib/incidents.ts'
import type { FxKind } from '#/lib/operations.ts'

/** Legend colour per effect, matching the map. */
export const FX_SWATCH: Record<FxKind, string> = {
  explosion: '#ff5a1a',
  fire: '#ffb22e',
  gas: '#a6e05a',
  poison: '#b48ad8',
  collapse: '#c9c4a0',
  crowd: '#ff8a6a',
  flicker: '#ffe36a',
  surge: '#6fd0ff',
  siren: '#ff3a22',
  echo: '#b9a0ff',
  vanish: '#e9f5c8',
  calm: '#6dff55',
}

/**
 * Compact incident history, newest first. Hover or focus a row to point at
 * it on the map; click to keep it marked and get Replay / Open file.
 */
export function IncidentHistory({
  incidents,
  now,
  showDistrict = false,
  hovered,
  pinned,
  onHover,
  onPin,
  onReplay,
}: {
  incidents: Incident[]
  now: number
  showDistrict?: boolean
  hovered: string | null
  pinned: string | null
  onHover: (key: string | null) => void
  onPin: (key: string | null) => void
  onReplay: (key: string) => void
}) {
  const t = totalsToday(incidents, now)
  const counted = [
    `${t.count} ${t.count === 1 ? 'incident' : 'incidents'}`,
    `${t.casualties} dead`,
    ...(t.missing ? [`${t.missing} missing`] : []),
    `${t.injured} hurt`,
  ].join(' · ')

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="label flex items-center gap-2">
          Incident history
          <InfoTip
            label="About the incident history"
            text="Attacks and accidents of the last week, newest first. Hover one to mark it on the map, click it to replay its animation or open its file. Marks on the map fade over two days."
          />
        </h3>
        <span className="text-lg leading-tight text-ink-dim uppercase" suppressHydrationWarning>
          Last 24 h: {counted}
        </span>
      </div>

      {incidents.length === 0 ? (
        <p className="text-xl leading-tight text-ink-dim">Nothing has happened here this week.</p>
      ) : (
        <ol className="crt max-h-[15rem] overflow-y-auto rounded-[10px] p-2 text-xl leading-tight" aria-label="Incidents, newest first" onPointerLeave={() => onHover(null)}>
          {incidents.map((i) => {
            const isPinned = pinned === i.key
            const lit = isPinned || hovered === i.key
            return (
              <li key={i.key} className={lit ? 'bg-phos/10' : undefined}>
                <button
                  type="button"
                  aria-pressed={isPinned}
                  onPointerEnter={() => onHover(i.key)}
                  onFocus={() => onHover(i.key)}
                  onBlur={() => onHover(null)}
                  onClick={() => onPin(isPinned ? null : i.key)}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-x-2 px-2 py-1 text-left focus:outline-none focus-visible:bg-phos/15"
                >
                  <span aria-hidden="true" className="inline-block size-3 border-2 border-edge" style={{ background: FX_SWATCH[i.fx] }} />
                  <span className="min-w-0">
                    <span className="text-phos">{i.label}</span>
                    <span className="text-phos-dim">
                      {' '}· {i.siteName}
                      {showDistrict && `, ${DISTRICTS[i.district]?.name ?? i.district}`} · <RelativeTime iso={i.at} />
                    </span>
                  </span>
                  <span className={i.casualties > 0 ? 'text-[#ff7a5c]' : 'text-phos-dim'}>{harmLine(i)}</span>
                </button>
                {isPinned && (
                  <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pl-7">
                    <Tip text="Play this incident's animation on the map again.">
                      <button type="button" onClick={() => onReplay(i.key)} className="btn px-3 py-1 text-xs">▶ Replay</button>
                    </Tip>
                    {i.glitchId && (
                      <Link to="/glitches/$glitchId" params={{ glitchId: i.glitchId }} className="btn px-3 py-1 text-xs">
                        Open {i.glitchId} ▸
                      </Link>
                    )}
                    {i.radius > 0 && <span className="text-lg text-phos-dim">Radius {i.radius} m</span>}
                    {i.operationId && <span className="text-lg text-amber">{i.operationId}</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
