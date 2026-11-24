import { createFileRoute, getRouteApi, Link, notFound, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { CityPlan, SiteIcon, type SiteIncident } from '#/components/CityPlan.tsx'
import { useTransmit } from '#/components/layout/Shell.tsx'
import { MoodMeters } from '#/components/MoodMeters.tsx'
import { OperationsDesk } from '#/components/OperationsDesk.tsx'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { StatusStamp } from '#/components/ui/StatusStamp.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { DISTRICT_IDS, DISTRICTS, isDistrictId, SITE_META, SITE_TYPES, siteId, type SiteType } from '#/lib/districts.ts'
import { SITE_IMPACT } from '#/lib/operations.ts'
import { getDistrict } from '#/lib/operations.functions.ts'

export const Route = createFileRoute('/_authed/districts/$districtId')({
  validateSearch: (search: Record<string, unknown>): { site?: SiteType } => ({
    site: SITE_TYPES.includes(search.site as SiteType) ? (search.site as SiteType) : undefined,
  }),
  loader: async ({ params }) => {
    if (!isDistrictId(params.districtId)) throw notFound()
    return getDistrict({ data: params.districtId })
  },
  head: ({ params }) => ({
    meta: [{ title: `${isDistrictId(params.districtId) ? DISTRICTS[params.districtId].name : 'District'} · Guardians of the Grid` }],
  }),
  notFoundComponent: () => (
    <div className="crt mx-auto max-w-xl px-8 py-16 text-center text-2xl">
      <p className="text-5xl text-phos">NO SUCH DISTRICT</p>
      <Link to="/" className="btn mt-8 inline-block px-6 py-3 text-sm">Back to the world map</Link>
    </div>
  ),
  component: DistrictPage,
})

const authed = getRouteApi('/_authed')

function DistrictPage() {
  const { districtId } = Route.useParams()
  const id = districtId as (typeof DISTRICT_IDS)[number]
  const { mood, chatter, operations } = Route.useLoaderData()
  const { site } = Route.useSearch()
  const { guardian } = authed.useRouteContext()
  const glitches = authed.useLoaderData()
  const navigate = useNavigate({ from: '/districts/$districtId' })
  const transmit = useTransmit()
  const d = DISTRICTS[id]
  const isCommander = guardian.role === 'commander'

  const here = useMemo(() => glitches.filter((g) => g.district === id), [glitches, id])
  const incidents: SiteIncident[] = useMemo(
    () => [
      ...here.filter((g) => g.siteId).map((g) => ({ siteId: g.siteId!, status: g.status })),
      ...(operations ?? []).filter((o) => o.status === 'PLANNED').map((o) => ({ siteId: o.siteId, status: 'PLANNED_OP' as const })),
    ],
    [here, operations],
  )
  const selectSite = (s: SiteType) => navigate({ search: { site: s }, replace: true, resetScroll: false })

  const idx = DISTRICT_IDS.indexOf(id)
  const prev = DISTRICT_IDS[(idx + DISTRICT_IDS.length - 1) % DISTRICT_IDS.length]
  const next = DISTRICT_IDS[(idx + 1) % DISTRICT_IDS.length]

  const siteGlitches = site ? here.filter((g) => g.siteId === siteId(id, site)) : []
  const openHere = here.filter((g) => g.status !== 'FIXED')

  return (
    <div key={id} className="flex flex-col gap-6 [animation:zoom-in_420ms_steps(7)_both]">
      {/* Location bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" search={{ district: id }} className="btn px-4 py-2 text-xs">◀ World map</Link>
          <Link to="/districts/$districtId" params={{ districtId: prev }} className="btn px-3 py-2 text-xs" aria-label={`Previous district: ${DISTRICTS[prev].name}`}>◀ {DISTRICTS[prev].name}</Link>
          <Link to="/districts/$districtId" params={{ districtId: next }} className="btn px-3 py-2 text-xs" aria-label={`Next district: ${DISTRICTS[next].name}`}>{DISTRICTS[next].name} ▶</Link>
        </div>
        <Tip text="People living in this district. The more afraid they are, the fewer you see walking the streets.">
          <span className="readout px-3 py-1 text-2xl" tabIndex={0}>POP {d.population.toLocaleString('en')}</span>
        </Tip>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* City plan */}
        <section aria-labelledby="plan-heading" className="metal rivets p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
            <h1 id="plan-heading" className="flex items-center gap-2">
              <span className="stamp text-2xl font-bold">{d.name}</span>
              <InfoTip label="How to use the city plan" text="Click a landmark to see what's happening there and to report or plan something at it. Small squares walking the streets are residents." />
            </h1>
            <span className="text-lg text-[#c8c49a]">{d.lore}</span>
          </div>
          <div className="inset bg-edge p-1">
            <CityPlan district={id} mood={mood} incidents={incidents} selected={site} onSelect={selectSite} />
          </div>
          <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1" aria-label="City plan legend">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 border border-edge bg-[#e9f5c8]" /><span className="stamp text-[10px]">Resident</span></li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 border-2 border-edge bg-[#ff3a22]" /><span className="stamp text-[10px]">Leaked glitch</span></li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 border-2 border-edge bg-[#ffb22e]" /><span className="stamp text-[10px]">Open glitch</span></li>
            {isCommander && <li className="flex items-center gap-2"><span aria-hidden="true" className="readout px-1 text-sm leading-none">OP</span><span className="stamp text-[10px]">Planned operation</span></li>}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          {/* Selected landmark */}
          <section aria-labelledby="site-heading" className="metal rivets p-5">
            {site ? (
              <>
                <div className="flex items-start gap-4">
                  <span className="inset flex shrink-0 items-center justify-center bg-[#1a140a] p-2"><SiteIcon type={site} size={44} /></span>
                  <div className="min-w-0">
                    <p className="stamp text-[10px]">{SITE_META[site].label}</p>
                    <h2 id="site-heading" className="stamp text-xl font-bold">{d.sites[site]}</h2>
                    <p className="leading-tight text-[#d8d3a6]">{SITE_META[site].hint}</p>
                  </div>
                </div>
                <div className="crt mt-4 rounded-[10px] p-4 text-xl">
                  {siteGlitches.length === 0 ? (
                    <p className="text-phos-dim">&gt; NO INCIDENTS ON FILE AT THIS SITE.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {siteGlitches.map((g) => (
                        <li key={g.glitchId}>
                          <Link to="/glitches/$glitchId" params={{ glitchId: g.glitchId }} className="grid grid-cols-[1fr_auto] gap-3 hover:bg-phos/10">
                            <span className="text-phos">{g.glitchId} · {g.description}</span>
                            <StatusStamp status={g.status} />
                          </Link>
                          {g.stagedBy && <span className="text-base text-amber">STAGED · {g.stagedBy}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => transmit({ district: id, siteId: siteId(id, site) })} className="btn flex items-center gap-2 px-4 py-2.5 text-xs">
                    <span data-on="red" className="lamp size-3" aria-hidden="true" /> Report echo here
                  </button>
                  {isCommander && (
                    <a href="#ops-heading" className="btn px-4 py-2.5 text-xs">Plan operation here ▾</a>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 id="site-heading" className="stamp text-xl font-bold">Landmarks</h2>
                <p className="mb-3 leading-tight text-[#d8d3a6]">Pick a landmark on the plan, or here.</p>
                <ul className="flex flex-col gap-2">
                  {SITE_TYPES.map((t) => (
                    <li key={t}>
                      <button type="button" onClick={() => selectSite(t)} className="btn flex w-full items-center gap-3 px-3 py-2 text-left text-xs">
                        <SiteIcon type={t} size={24} />
                        <span className="flex-1">{d.sites[t]}</span>
                        <span className="font-mono text-lg normal-case text-[#c8c49a]">{SITE_META[t].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Residents */}
          <section aria-labelledby="people-heading" className="metal rivets p-5">
            <h2 id="people-heading" className="mb-3 flex items-center gap-2">
              <span className="stamp text-xl font-bold">Residents</span>
              <InfoTip label="About residents" text="How the people of this district feel right now. Arrows show the change from their normal mood." />
            </h2>
            <MoodMeters mood={mood} baseline={d.baseline} />

            <h3 className="stamp mt-5 mb-2 flex items-center gap-2 text-xs">
              What’s driving it
              <InfoTip
                label="About drivers"
                text={isCommander ? 'Open glitches and your operations, with their current effect. Operation effects fade over two days.' : 'Open glitches in this district. Some causes are unconfirmed rumours.'}
              />
            </h3>
            {mood.drivers.length === 0 ? (
              <p className="text-lg text-[#d8d3a6]">Nothing unusual. Residents are at their normal mood.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-lg leading-tight">
                {mood.drivers.map((dr, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-3">
                    <span className={dr.kind === 'operation' ? 'text-amber' : dr.kind === 'rumour' ? 'text-[#ff8a6a]' : 'text-[#e8e4d0]'}>
                      {dr.kind === 'operation' ? '◆ ' : dr.kind === 'rumour' ? '? ' : '• '}
                      {dr.label}
                    </span>
                    <span className="text-[#c8c49a]">
                      FEAR +{Math.round(dr.effect.fear)} · ANX +{Math.round(dr.effect.anxiety)} · JOY {Math.round(dr.effect.happiness)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="stamp mt-5 mb-2 flex items-center gap-2 text-xs">
              Listening post
              <InfoTip label="About the listening post" text="Things residents were overheard saying today. It changes with their mood." />
            </h3>
            <ul className="crt flex flex-col gap-2 rounded-[10px] p-4 text-xl leading-tight">
              {chatter.map((line) => (
                <li key={line} className="text-phos">“{line}”</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Open glitches in the district */}
      <section aria-labelledby="dg-heading" className="metal rivets p-5">
        <h2 id="dg-heading" className="stamp mb-3 text-lg font-bold">Open glitches in {d.name} · {openHere.length}</h2>
        {openHere.length === 0 ? (
          <p className="text-lg text-[#d8d3a6]">None. This district is stable.</p>
        ) : (
          <ul className="crt flex flex-col gap-1 p-4 text-xl">
            {openHere.map((g) => (
              <li key={g.glitchId}>
                <Link to="/glitches/$glitchId" params={{ glitchId: g.glitchId }} className="grid grid-cols-[1fr_auto] items-center gap-3 px-2 py-1 hover:bg-phos/10">
                  <span className="min-w-0">
                    <span className="text-phos">{g.description}</span>
                    <span className="block text-lg text-phos-dim uppercase">
                      {g.glitchId}{g.siteId ? ` · ${DISTRICTS[id].sites[g.siteId.split(':')[1] as SiteType]}` : ''} · <RelativeTime iso={g.timestamp} />
                      {g.stagedBy && <span className="text-amber"> · STAGED {g.stagedBy}</span>}
                    </span>
                  </span>
                  <StatusStamp status={g.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCommander && operations && (
        <OperationsDesk district={id} mood={mood} site={site} onSite={selectSite} operations={operations} />
      )}

      {isCommander && <p className="stamp text-[10px] opacity-80">
        Impact by site · {SITE_TYPES.map((t) => `${SITE_META[t].label} ×${SITE_IMPACT[t].factor}`).join(' · ')}
      </p>}
    </div>
  )
}
