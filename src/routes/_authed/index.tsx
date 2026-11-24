import { createFileRoute, getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DistrictMap, districtStats } from '#/components/DistrictMap.tsx'
import { useTransmit } from '#/components/layout/Shell.tsx'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { StatusStamp } from '#/components/ui/StatusStamp.tsx'
import { DISTRICTS, isDistrictId, type DistrictId } from '#/lib/districts.ts'
import { GLITCH_STATUSES, STATUS_META, type GlitchStatus } from '#/lib/glitch.ts'
import { useHotkeys } from '#/lib/useHotkeys.ts'

type BoardSearch = { q?: string; status?: GlitchStatus; district?: DistrictId }

export const Route = createFileRoute('/_authed/')({
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    status: GLITCH_STATUSES.includes(search.status as GlitchStatus)
      ? (search.status as GlitchStatus)
      : undefined,
    district: isDistrictId(search.district) ? search.district : undefined,
  }),
  component: BoardPage,
})

const authed = getRouteApi('/_authed')

const RAIL_LAMP: Record<GlitchStatus, 'red' | 'amber' | 'green' | undefined> = {
  LEAKED: 'red',
  ASSESSING: 'amber',
  CONTAINING: 'green',
  FIXED: undefined,
}

function BoardPage() {
  const glitches = authed.useLoaderData()
  const { q = '', status, district } = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const transmit = useTransmit()
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [cursor, setCursor] = useState(0)
  const [hovered, setHovered] = useState<DistrictId | null>(null)

  // Status counts follow the district filter, so the rail and the list agree.
  const inDistrict = useMemo(
    () => (district ? glitches.filter((g) => g.district === district) : glitches),
    [glitches, district],
  )

  const counts = useMemo(() => {
    const c = Object.fromEntries(GLITCH_STATUSES.map((s) => [s, 0])) as Record<GlitchStatus, number>
    inDistrict.forEach((g) => c[g.status]++)
    return c
  }, [inDistrict])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return inDistrict.filter(
      (g) =>
        (!status || g.status === status) &&
        (!needle ||
          g.glitchId.toLowerCase().includes(needle) ||
          g.description.toLowerCase().includes(needle) ||
          DISTRICTS[g.district].name.toLowerCase().includes(needle)),
    )
  }, [inDistrict, q, status])

  useEffect(() => setCursor(0), [q, status, district])

  const focusRow = (i: number) => {
    const next = Math.max(0, Math.min(visible.length - 1, i))
    setCursor(next)
    listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]')[next]?.focus()
  }

  useHotkeys({
    j: () => focusRow(cursor + 1),
    k: () => focusRow(cursor - 1),
    '/': () => searchRef.current?.focus(),
  })

  const setFilter = (next: BoardSearch) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      {/* World map */}
      <section aria-labelledby="map-heading" className="lg:sticky lg:top-6 lg:self-start">
        <div className="metal rivets p-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <h2 id="map-heading" className="stamp text-lg font-bold">World map · Achrona</h2>
            <span className="flex items-center gap-2" aria-hidden="true">
              <span data-on="green" className="lamp size-2.5" />
              <span className="stamp text-[10px]">Survey link</span>
            </span>
          </div>
          <div className="inset bg-edge p-1">
            <DistrictMap glitches={glitches} selected={district} onSelect={(id) => setFilter({ district: id })} onHover={setHovered} />
          </div>
          <DistrictIntel
            district={hovered ?? district}
            stats={districtStats(glitches)}
            isFilter={!hovered && Boolean(district)}
            onClear={() => setFilter({ district: undefined })}
            onReport={(id) => transmit({ district: id })}
          />
        </div>
      </section>

      {/* Case files console */}
      <section aria-labelledby="files-heading" className="metal rivets flex min-w-0 flex-col gap-5 p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 px-1">
          <div>
            <p className="text-lg leading-none text-[#c8c49a] uppercase">{district ? DISTRICTS[district].name : 'All districts'}</p>
            <h1 id="files-heading" className="stamp text-3xl font-bold">Case files</h1>
          </div>
          <button type="button" onClick={() => transmit({ district })} className="btn flex items-center gap-3 px-5 py-3 text-base">
            <span data-on="red" className="lamp size-4" aria-hidden="true" />
            Transmit echo
            <span className="text-[10px] opacity-70">[E]</span>
          </button>
        </div>

        {/* Status rail doubles as the filter. */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5" role="group" aria-label="Filter by status">
          <RailButton active={!status} onClick={() => setFilter({ status: undefined })} count={inDistrict.length} label="All" hint="Every glitch on record" lamp="green" />
          {GLITCH_STATUSES.map((s) => (
            <RailButton
              key={s}
              active={status === s}
              onClick={() => setFilter({ status: status === s ? undefined : s })}
              count={counts[s]}
              label={STATUS_META[s].label}
              hint={STATUS_META[s].hint}
              lamp={counts[s] > 0 ? RAIL_LAMP[s] : undefined}
              blink={s === 'LEAKED' && counts[s] > 0}
            />
          ))}
        </div>

        {/* The terminal */}
        <div className="crt flex min-h-[24rem] flex-col p-3 sm:p-5">
          <label className="flex items-center gap-2 border-b border-phos-dim/50 pb-3 text-2xl">
            <span aria-hidden="true" className="text-phos">&gt;</span>
            <span className="sr-only">Search glitches</span>
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setFilter({ q: e.target.value || undefined })}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); focusRow(0) }
                if (e.key === 'Escape') e.currentTarget.blur()
              }}
              placeholder="SEARCH ID, TEXT OR DISTRICT_"
              className="w-full bg-transparent text-phos uppercase caret-phos placeholder:text-phos-dim focus:outline-none"
            />
          </label>

          {visible.length === 0 ? (
            <div className="py-12 text-center text-2xl">
              <p className="text-phos">NO SIGNAL.</p>
              <p className="text-phos-dim">Clear the search, pick another status or another district.</p>
            </div>
          ) : (
            <ol ref={listRef} className="mt-2 flex flex-col" aria-label="Glitches">
              {visible.map((g, i) => (
                <li key={g.glitchId}>
                  <Link
                    data-row
                    to="/glitches/$glitchId"
                    params={{ glitchId: g.glitchId }}
                    onFocus={() => setCursor(i)}
                    onMouseEnter={() => setHovered(g.district)}
                    onMouseLeave={() => setHovered(null)}
                    className={`grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr_auto] px-2 py-2 leading-tight focus:outline-none hover:bg-phos/10 focus:bg-phos/15 ${cursor === i ? 'bg-phos/10' : ''}`}
                  >
                    <span aria-hidden="true" className={`pt-0.5 text-xl ${cursor === i ? 'text-phos' : 'text-phos-dim'}`}>{cursor === i ? '▶' : '•'}</span>
                    <span className="min-w-0">
                      <span className={`block text-[22px] ${g.status === 'FIXED' ? 'text-phos-dim line-through' : 'text-phos'}`}>
                        {g.description}
                      </span>
                      <span className="text-lg text-phos-dim uppercase">
                        {g.glitchId} · {DISTRICTS[g.district].name} · <RelativeTime iso={g.timestamp} /> · {g.echoCount} {g.echoCount === 1 ? 'echo' : 'echoes'}
                      </span>
                    </span>
                    <span className="col-start-2 sm:col-start-auto sm:pt-1"><StatusStamp status={g.status} /></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

function DistrictIntel({
  district, stats, isFilter, onClear, onReport,
}: {
  district: DistrictId | undefined
  stats: ReturnType<typeof districtStats>
  isFilter: boolean
  onClear: () => void
  onReport: (id: DistrictId) => void
}) {
  const d = district ? DISTRICTS[district] : undefined
  const s = district ? stats[district] : undefined
  return (
    <div className="mt-4 flex flex-wrap items-stretch gap-3">
      <div className="crt min-h-[5.5rem] min-w-0 flex-1 rounded-[10px] px-4 py-2 text-xl" aria-live="polite">
        {d && s ? (
          <>
            <div className="text-2xl text-phos uppercase">{d.name}</div>
            <div className="text-phos-dim">{d.lore}</div>
            <div className="text-phos">
              OPEN {s.open} · <span className={s.leaked ? 'text-[#ff7a5c]' : ''}>LEAKED {s.leaked}</span> · TOTAL {s.total}
            </div>
          </>
        ) : (
          <div className="text-phos-dim">
            &gt; HOVER A DISTRICT FOR INTEL.<br />&gt; CLICK TO FILTER. CLICK A BEACON TO OPEN ITS GLITCH.
          </div>
        )}
      </div>
      {isFilter && district && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => onReport(district)} className="btn flex-1 px-3 text-xs">Report here</button>
          <button type="button" onClick={onClear} className="btn flex-1 px-3 text-xs">All districts</button>
        </div>
      )}
    </div>
  )
}

function RailButton({
  active, onClick, count, label, hint, lamp, blink = false,
}: {
  active: boolean; onClick: () => void; count: number; label: string; hint: string
  lamp?: 'red' | 'amber' | 'green'; blink?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className="btn flex flex-col items-center gap-1.5 px-1 pt-2 pb-1.5"
    >
      <span className="flex w-full items-center justify-between px-1">
        <span data-on={lamp} className={`lamp size-2.5 ${blink ? 'animate-blink' : ''}`} aria-hidden="true" />
        <span className="readout px-1.5 font-mono text-2xl leading-none normal-case">{String(count).padStart(2, '0')}</span>
      </span>
      <span className="w-full truncate text-center text-[10px]">{label}</span>
    </button>
  )
}
