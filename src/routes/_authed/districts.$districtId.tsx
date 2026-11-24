import { createFileRoute, getRouteApi, Link, notFound, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CityPlan, SiteIcon, type SiteIncident } from '#/components/CityPlan.tsx'
import { useTransmit } from '#/components/layout/Shell.tsx'
import { MoodMeters } from '#/components/MoodMeters.tsx'
import { OperationsLog } from '#/components/ops/OperationsLog.tsx'
import { PlanOperationWizard, type PlanRequest } from '#/components/ops/PlanOperationWizard.tsx'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { StatusStamp } from '#/components/ui/StatusStamp.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { DISTRICT_IDS, DISTRICTS, isDistrictId, SITE_META, SITE_TYPES, siteId, type SiteType } from '#/lib/districts.ts'
import { getDistrict } from '#/lib/operations.functions.ts'
import { getIncidents } from '#/lib/incidents.functions.ts'
import { IncidentHistory } from '#/components/fx/IncidentHistory.tsx'
import { useIncidents } from '#/components/fx/useIncidents.ts'
import { useNow } from '#/lib/useNow.ts'
import { canCommand } from '#/lib/glitch.ts'

export const Route = createFileRoute('/_authed/districts/$districtId')({
  validateSearch: (search: Record<string, unknown>): { site?: SiteType } => ({
    site: SITE_TYPES.includes(search.site as SiteType) ? (search.site as SiteType) : undefined,
  }),
  loader: async ({ params }) => {
    if (!isDistrictId(params.districtId)) throw notFound()
    const [district, incidents] = await Promise.all([
      getDistrict({ data: params.districtId }),
      getIncidents({ data: { district: params.districtId } }),
    ])
    return { ...district, incidents }
  },
  head: ({ params }) => ({
    meta: [{ title: `${isDistrictId(params.districtId) ? DISTRICTS[params.districtId].name : 'District'} · Guardians of the Grid` }],
  }),
  notFoundComponent: () => (
    <div className="crt mx-auto max-w-xl px-8 py-16 text-center text-2xl">
      <p className="text-5xl text-phos">NO SUCH DISTRICT</p>
      <Link to="/" className="btn btn-primary mt-8 inline-block px-6 py-3 text-sm">Back to the world map</Link>
    </div>
  ),
  component: DistrictPage,
})

const authed = getRouteApi('/_authed')

function DistrictPage() {
  const { districtId } = Route.useParams()
  const id = districtId as (typeof DISTRICT_IDS)[number]
  const { mood, chatter, operations, incidents: loadedIncidents } = Route.useLoaderData()
  const fx = useIncidents(loadedIncidents, id)
  const now = useNow(30_000)
  const { site } = Route.useSearch()
  const { guardian } = authed.useRouteContext()
  const glitches = authed.useLoaderData()
  const navigate = useNavigate({ from: '/districts/$districtId' })
  const transmit = useTransmit()
  const [plan, setPlan] = useState<PlanRequest | null>(null)
  const d = DISTRICTS[id]
  const isCommander = canCommand(guardian.role)

  const here = useMemo(() => glitches.filter((g) => g.district === id), [glitches, id])
  const incidents: SiteIncident[] = useMemo(
    () => [
      ...here.filter((g) => g.siteId).map((g) => ({ siteId: g.siteId!, status: g.status })),
      ...(operations ?? []).filter((o) => o.status === 'PLANNED').map((o) => ({ siteId: o.siteId, status: 'PLANNED_OP' as const })),
    ],
    [here, operations],
  )
  const selectSite = (s: SiteType | undefined) => navigate({ search: { site: s }, replace: true, resetScroll: false })

  const idx = DISTRICT_IDS.indexOf(id)
  const prev = DISTRICT_IDS[(idx + DISTRICT_IDS.length - 1) % DISTRICT_IDS.length]
  const next = DISTRICT_IDS[(idx + 1) % DISTRICT_IDS.length]

  const siteGlitches = site ? here.filter((g) => g.siteId === siteId(id, site)) : []
  const openHere = here.filter((g) => g.status !== 'FIXED')

  return (
    <div key={id} className="flex flex-col gap-8 [animation:zoom-in_420ms_steps(7)_both]">
      {/* Where am I, and the main action */}
      <header className="metal rivets flex flex-col gap-4 p-4 sm:p-5">
        <nav aria-label="Districts" className="flex flex-wrap items-center gap-2">
          <Link to="/" search={{ district: id }} className="btn px-3 py-2 text-sm">◀ World map</Link>
          <span className="ml-auto flex gap-2">
            <Link to="/districts/$districtId" params={{ districtId: prev }} className="btn px-3 py-2 text-sm" aria-label={`Previous district: ${DISTRICTS[prev].name}`} title={DISTRICTS[prev].name}>◀ Prev</Link>
            <Link to="/districts/$districtId" params={{ districtId: next }} className="btn px-3 py-2 text-sm" aria-label={`Next district: ${DISTRICTS[next].name}`} title={DISTRICTS[next].name}>Next ▶</Link>
          </span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="stamp text-2xl font-bold sm:text-3xl">{d.name}</h1>
            <p className="text-xl leading-tight text-ink-dim">{d.lore}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Tip text="People living in this district. The more afraid they are, the fewer you see walking the streets.">
              <span className="readout px-3 py-1 text-2xl" tabIndex={0}>POP {d.population.toLocaleString('en')}</span>
            </Tip>
            {isCommander ? (
              <button type="button" onClick={() => setPlan({ site })} className="btn btn-primary flex items-center gap-2 px-5 py-3 text-sm">
                <span data-on="red" className="lamp size-3" aria-hidden="true" /> Plan operation
              </button>
            ) : (
              <button type="button" onClick={() => transmit({ district: id })} className="btn btn-primary flex items-center gap-2 px-5 py-3 text-sm">
                <span data-on="red" className="lamp size-3" aria-hidden="true" /> Report echo
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* City plan */}
        <section aria-labelledby="plan-heading" className="metal rivets min-w-0 p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <h2 id="plan-heading" className="flex items-center gap-2">
              <span className="stamp text-xl font-bold">City plan</span>
              <InfoTip label="How to use the city plan" text="Click a landmark to see what's happening there and to report or plan something at it. Small squares walking the streets are residents." />
            </h2>
            <span className="text-xl leading-tight text-ink-dim">Click a landmark.</span>
          </div>
          <div className="inset bg-edge p-1">
            <CityPlan
              district={id}
              mood={mood}
              incidents={incidents}
              selected={site}
              onSelect={selectSite}
              attacks={fx.incidents}
              fxFocus={fx.focus}
              now={now}
            />
          </div>
          <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-lg text-ink-dim uppercase" aria-label="City plan legend">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 border border-edge bg-[#e9f5c8]" />Resident</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 border-2 border-edge bg-[#ff3a22]" />Leaked glitch</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3.5 border-2 border-edge bg-[#ffb22e]" />Open glitch</li>
            {isCommander && <li className="flex items-center gap-2"><span aria-hidden="true" className="readout px-1 text-sm leading-none">OP</span>Planned operation</li>}
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-3.5 rounded-full border-2 border-dashed border-[#ff5a1a]" />
              <Tip text="The dashed circle around an incident is the area it hit: everyone inside it was in danger. It fades over two days, along with the smoke and scorch marks.">
                <span tabIndex={0}>Affected area</span>
              </Tip>
            </li>
          </ul>
          <IncidentHistory
            incidents={fx.incidents}
            now={now}
            hovered={fx.hovered}
            pinned={fx.pinned}
            onHover={fx.setHovered}
            onPin={fx.setPinned}
            onReplay={fx.replay}
          />
        </section>

        <div className="flex min-w-0 flex-col gap-8">
          {/* Selected landmark */}
          <section aria-labelledby="site-heading" className="metal rivets p-4 sm:p-5">
            {site ? (
              <>
                <div className="flex items-start gap-4">
                  <span className="inset flex shrink-0 items-center justify-center bg-[#1a140a] p-2"><SiteIcon type={site} size={44} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-tight text-ink-dim uppercase">{SITE_META[site].label}</p>
                    <h2 id="site-heading" className="stamp text-xl font-bold">{d.sites[site]}</h2>
                    <p className="text-xl leading-tight text-ink-dim">{SITE_META[site].hint}</p>
                  </div>
                  <button type="button" onClick={() => selectSite(undefined)} className="btn shrink-0 px-2.5 py-1.5 text-sm" aria-label="Back to all landmarks">✕</button>
                </div>
                <div className="crt mt-4 rounded-[10px] p-4 text-xl">
                  {siteGlitches.length === 0 ? (
                    <p className="text-phos-dim">&gt; NO INCIDENTS ON FILE AT THIS SITE.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {siteGlitches.map((g) => (
                        <li key={g.glitchId}>
                          <Link to="/glitches/$glitchId" params={{ glitchId: g.glitchId }} className="grid grid-cols-[1fr_auto] gap-3 hover:bg-phos/10">
                            <span className="min-w-0 break-words text-phos">{g.glitchId} · {g.description}</span>
                            <StatusStamp status={g.status} />
                          </Link>
                          {g.stagedBy && <span className="text-lg text-amber">STAGED · {g.stagedBy}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {isCommander && (
                    <button type="button" onClick={() => setPlan({ site })} className="btn btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
                      Plan operation here ▸
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => transmit({ district: id, siteId: siteId(id, site) })}
                    className={`btn flex items-center gap-2 px-4 py-2.5 text-sm ${isCommander ? '' : 'btn-primary'}`}
                  >
                    <span data-on="red" className="lamp size-3" aria-hidden="true" /> Report echo here
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="site-heading" className="stamp text-xl font-bold">Landmarks</h2>
                <p className="mb-3 text-xl leading-tight text-ink-dim">Pick one here or on the plan.</p>
                <ul className="flex flex-col gap-2">
                  {SITE_TYPES.map((t) => (
                    <li key={t}>
                      <button type="button" onClick={() => selectSite(t)} className="btn flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
                        <SiteIcon type={t} size={24} />
                        <span className="min-w-0 flex-1 truncate">{d.sites[t]}</span>
                        <span className="hidden font-mono text-lg normal-case text-ink-dim sm:inline">{SITE_META[t].label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Residents */}
          <section aria-labelledby="people-heading" className="metal rivets p-4 sm:p-5">
            <h2 id="people-heading" className="mb-3 flex items-center gap-2">
              <span className="stamp text-xl font-bold">Residents</span>
              <InfoTip label="About residents" text="How the people of this district feel right now. Arrows show the change from their normal mood." />
            </h2>
            <MoodMeters mood={mood} baseline={d.baseline} />

            <h3 className="label mt-6 mb-2 flex items-center gap-2">
              What’s driving it
              <InfoTip
                label="About drivers"
                text={isCommander ? 'Open glitches and your operations, with their current effect. Operation effects fade over two days.' : 'Open glitches in this district. Some causes are unconfirmed rumours.'}
              />
            </h3>
            {mood.drivers.length === 0 ? (
              <p className="text-xl leading-tight text-ink-dim">Nothing unusual. Residents are at their normal mood.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-xl leading-tight">
                {mood.drivers.map((dr, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-3">
                    <span className={dr.kind === 'operation' ? 'text-amber' : dr.kind === 'rumour' ? 'text-[#ff9a7e]' : 'text-ink'}>
                      {dr.kind === 'operation' ? '◆ ' : dr.kind === 'rumour' ? '? ' : '• '}
                      {dr.label}
                    </span>
                    <span className="text-ink-dim">
                      FEAR +{Math.round(dr.effect.fear)} · ANX +{Math.round(dr.effect.anxiety)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="label mt-6 mb-2 flex items-center gap-2">
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

      <div className={`grid gap-8 ${isCommander && operations ? 'lg:grid-cols-2' : ''}`}>
        {/* Open glitches in the district */}
        <section aria-labelledby="dg-heading" className="metal rivets min-w-0 p-4 sm:p-5">
          <h2 id="dg-heading" className="stamp mb-3 text-xl font-bold">Open glitches · {openHere.length}</h2>
          {openHere.length === 0 ? (
            <p className="text-xl text-ink-dim">None. This district is stable.</p>
          ) : (
            <ul className="crt flex flex-col gap-1 p-3 text-xl sm:p-4">
              {openHere.map((g) => (
                <li key={g.glitchId}>
                  <Link to="/glitches/$glitchId" params={{ glitchId: g.glitchId }} className="grid grid-cols-[1fr_auto] items-center gap-3 px-2 py-1 hover:bg-phos/10">
                    <span className="min-w-0">
                      <span className="break-words text-phos">{g.description}</span>
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
          <section aria-labelledby="ops-heading" className="metal rivets min-w-0 p-4 sm:p-5">
            <h2 id="ops-heading" className="mb-3 flex items-center gap-2">
              <span className="stamp text-xl font-bold">Operations log</span>
              <InfoTip label="About the operations log" text="Your false flag operations in this district. Planned ones can be cancelled until they go off. Commanders only." />
            </h2>
            <OperationsLog operations={operations} />
          </section>
        )}
      </div>

      {isCommander && (
        <PlanOperationWizard district={id} mood={mood} request={plan} onClose={() => setPlan(null)} />
      )}
    </div>
  )
}
