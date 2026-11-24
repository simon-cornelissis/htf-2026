import { createFileRoute, getRouteApi, Link, notFound, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DistrictMap } from '#/components/DistrictMap.tsx'
import { Kbd, useTransmit } from '#/components/layout/Shell.tsx'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { formatFull, RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { StatusStamp } from '#/components/ui/StatusStamp.tsx'
import { DISTRICTS, parseSiteId } from '#/lib/districts.ts'
import { GLITCH_STATUSES, STATUS_META, type GlitchStatus } from '#/lib/glitch.ts'
import { deleteEcho, deleteGlitch, getGlitch, setGlitchStatus } from '#/lib/glitches.functions.ts'
import { useHotkeys } from '#/lib/useHotkeys.ts'
import { getBomb, type BombState } from '#/lib/bombs.functions.ts'
import { useNow } from '#/lib/useNow.ts'
import { canCommand } from '#/lib/glitch.ts'
import { attributeGlitch, getGlitchCase, getPersonOptions, type GlitchCase } from '#/lib/persons.functions.ts'
import { PERSON_STATUS_META } from '#/lib/persons.ts'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'

export const Route = createFileRoute('/_authed/glitches/$glitchId')({
  validateSearch: (search: Record<string, unknown>): { fresh?: boolean } => ({
    fresh: search.fresh === true || search.fresh === 'true' ? true : undefined,
  }),
  loader: async ({ params }) => {
    const [glitch, bomb, caseInfo] = await Promise.all([
      getGlitch({ data: params.glitchId }),
      getBomb({ data: params.glitchId }),
      getGlitchCase({ data: params.glitchId }),
    ])
    if (!glitch) throw notFound()
    return { ...glitch, bomb, caseInfo }
  },
  head: ({ params }) => ({ meta: [{ title: `${params.glitchId} · Guardians of the Grid` }] }),
  notFoundComponent: () => (
    <div className="crt mx-auto max-w-xl px-8 py-16 text-center text-2xl">
      <p className="text-5xl text-phos">SIGNAL LOST</p>
      <p className="mt-3 text-phos-dim">This glitch was purged or never existed.</p>
      <Link to="/" className="btn mt-8 inline-block px-6 py-3 text-sm">Back to the map</Link>
    </div>
  ),
  component: GlitchPage,
})

const authed = getRouteApi('/_authed')

const STEP_LAMP: Record<GlitchStatus, 'red' | 'amber' | 'green'> = {
  LEAKED: 'red',
  ASSESSING: 'amber',
  CONTAINING: 'green',
  FIXED: 'green',
}

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

function GlitchPage() {
  const glitch = Route.useLoaderData()
  const { fresh } = Route.useSearch()
  const { guardian } = authed.useRouteContext()
  const all = authed.useLoaderData()
  const router = useRouter()
  const transmit = useTransmit()
  const [error, setError] = useState<string | null>(null)
  const isCommander = canCommand(guardian.role)
  const district = DISTRICTS[glitch.district]
  const site = parseSiteId(glitch.siteId)

  // J/K walk through the board in the same order as the list.
  const index = all.findIndex((g) => g.glitchId === glitch.glitchId)
  const go = (i: number) => {
    const target = all[i]
    if (target) router.navigate({ to: '/glitches/$glitchId', params: { glitchId: target.glitchId } })
  }
  useHotkeys({
    j: () => go(index + 1),
    k: () => go(index - 1),
    Escape: () => router.navigate({ to: '/' }),
  })

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.')
    }
  }

  async function onDelete() {
    setError(null)
    try {
      await deleteGlitch({ data: glitch.glitchId })
      await router.navigate({ to: '/' })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge failed. Try again.')
    }
  }

  const currentStep = GLITCH_STATUSES.indexOf(glitch.status)

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" search={{ district: glitch.district }} className="btn px-4 py-2 text-xs">◀ Back to the map</Link>
        <span className="readout px-3 py-0.5 text-2xl">FILE {String(index + 1).padStart(2, '0')}/{String(all.length).padStart(2, '0')}</span>
      </div>

      {/* Monitor + location */}
      <div className="metal rivets grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="crt flex flex-col justify-between gap-4 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xl text-phos-dim">
            <span>&gt; CASE FILE OPENED <time dateTime={glitch.timestamp} suppressHydrationWarning>{formatFull(glitch.timestamp).toUpperCase()}</time></span>
            <StatusStamp status={glitch.status} size="lg" />
          </div>
          <h1 key={glitch.glitchId} className={`text-[clamp(4.5rem,12vw,9rem)] leading-[0.8] text-phos ${fresh ? 'crt-in' : ''}`}>
            {glitch.glitchId}
          </h1>
          <p className="text-3xl leading-tight text-phos">{glitch.description}</p>
          {glitch.stagedBy && (
            <p className="border-2 border-amber px-3 py-1 text-xl text-amber">
              ◆ STAGED BY {glitch.stagedBy}. DEFENDERS SEE THIS AS A REAL GLITCH.
            </p>
          )}
          {glitch.caseInfo && <CaseStrips info={glitch.caseInfo} />}
        </div>
        <figure>
          <Link to="/districts/$districtId" params={{ districtId: glitch.district }} search={site ? { site: site.type } : {}} className="inset block bg-edge p-1 hover:outline hover:outline-2 hover:outline-amber" aria-label={`Zoom into ${district.name}`}>
            <DistrictMap glitches={all} highlight={glitch.district} focusGlitchId={glitch.glitchId} compact />
          </Link>
          <figcaption className="readout mt-3 px-3 py-1.5 text-xl leading-tight">
            <span className="text-2xl uppercase">{district.name}{site ? ` · ${district.sites[site.type]}` : ''}</span>
            <span className="block text-[#c98a1e]">{district.lore}</span>
            <span className="block text-base text-[#c98a1e]">Click the map to zoom into the district ▸</span>
          </figcaption>
        </figure>
      </div>

      {glitch.bomb && <BombPanel bomb={glitch.bomb} />}

      {/* Containment protocol */}
      <section aria-labelledby="status-heading" className="metal rivets p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 id="status-heading" className="stamp text-lg font-bold">Containment protocol</h2>
          {!isCommander && <span className="stamp text-[10px] opacity-80">Only commanders can switch</span>}
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GLITCH_STATUSES.map((s, i) => {
            const isCurrent = i === currentStep
            const isPast = i < currentStep
            const content = (
              <>
                <span className="flex w-full items-center justify-between">
                  <span className="text-[10px]">Step {i + 1}</span>
                  <span data-on={isCurrent ? STEP_LAMP[s] : undefined} className={`lamp size-4 ${isCurrent && s === 'LEAKED' ? 'animate-blink' : ''}`} aria-hidden="true" />
                </span>
                <span className="text-sm font-bold">{isPast ? '✓ ' : ''}{STATUS_META[s].label}</span>
                <span className="font-mono text-lg leading-none normal-case text-[#d8d3a6]">{STATUS_META[s].hint}</span>
              </>
            )
            const base = 'flex h-full w-full flex-col items-start gap-1.5 px-3 py-3 text-left'
            return (
              <li key={s}>
                {isCommander && !isCurrent ? (
                  <button
                    type="button"
                    onClick={() => run(() => setGlitchStatus({ data: { glitchId: glitch.glitchId, status: s } }))}
                    className={`btn ${base}`}
                    aria-label={`Set status to ${STATUS_META[s].label}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    className={`${base} font-pixel uppercase ${isCurrent ? 'btn' : 'inset bg-metal-lo text-stamp/60'}`}
                    aria-pressed={isCurrent ? true : undefined}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {content}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <div aria-live="polite" className="mt-2 min-h-6 px-1 font-pixel text-xs text-[#ff7a5c] uppercase">
          {error && `✕ ${error}`}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Radio log */}
        <section aria-labelledby="log-heading" className="metal rivets p-5">
          <h2 id="log-heading" className="stamp mb-3 px-1 text-lg font-bold">
            Radio log · {glitch.echoes.length} {glitch.echoes.length === 1 ? 'transmission' : 'transmissions'}
          </h2>
          <div className="crt p-5 text-[22px]">
            {glitch.echoes.length === 0 ? (
              <p className="text-phos-dim">&gt; NO TRANSMISSIONS. SEND THE FIRST ONE.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {glitch.echoes.map((echo, i) => (
                  <li key={echo.echoId} className="leading-tight">
                    <div className="flex flex-wrap items-center gap-x-3 text-lg text-phos-dim uppercase">
                      <time dateTime={echo.timestamp} suppressHydrationWarning>[{clock.format(new Date(echo.timestamp))}]</time>
                      <span className="text-amber">{echo.reportingCodename}</span>
                      <span>{echo.echoId}</span>
                      <RelativeTime iso={echo.timestamp} />
                      {i === 0 && <span className="text-[#ff7a5c]">First report</span>}
                      {isCommander && (
                        <HoldButton
                          label={`Hold to delete echo ${echo.echoId}`}
                          onConfirm={() => run(() => deleteEcho({ data: echo.echoId }))}
                          className="ml-auto px-2 text-base text-phos-dim hover:text-phos"
                        >
                          [DEL]
                        </HoldButton>
                      )}
                    </div>
                    <p className="text-phos">&gt; {echo.description}</p>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-phos animate-blink" aria-hidden="true">_</p>
          </div>
        </section>

        {/* Actions */}
        <aside className="flex flex-col gap-5">
          <div className="metal rivets p-5">
            <h2 className="stamp text-lg font-bold">Report an update</h2>
            <p className="mt-1 mb-4 leading-tight text-[#d8d3a6]">Seen something new about this glitch? Add it to the log.</p>
            <button type="button" onClick={() => transmit({ glitchId: glitch.glitchId })} className="btn flex w-full items-center justify-center gap-3 py-3 text-sm">
              <span data-on="red" className="lamp size-4" aria-hidden="true" />
              Transmit update
            </button>
          </div>

          {isCommander && glitch.caseInfo && !glitch.caseInfo.suspect && <AttributePanel glitchId={glitch.glitchId} />}

          {isCommander && (
            <div className="metal overflow-hidden">
              <div className="hazard h-4" aria-hidden="true" />
              <div className="p-5">
                <h2 className="stamp text-lg font-bold text-[#ff7a5c]">Purge file</h2>
                <p className="mt-1 mb-4 leading-tight text-[#d8d3a6]">Deletes this glitch and all its echoes. This can’t be undone.</p>
                <HoldButton
                  label={`Hold to delete ${glitch.glitchId}`}
                  onConfirm={onDelete}
                  className="btn w-full py-3 text-sm"
                >
                  Hold to purge
                </HoldButton>
              </div>
            </div>
          )}

          <p className="flex flex-wrap items-center gap-2">
            <Kbd>J/K</Kbd><span className="stamp text-[10px]">Next / prev</span>
            <Kbd>Esc</Kbd><span className="stamp text-[10px]">Back</span>
          </p>
        </aside>
      </div>
    </article>
  )
}

/** Planted device on this file: a loud call to defuse while it ticks, a short note once it's settled. */
function BombPanel({ bomb }: { bomb: BombState }) {
  const now = useNow(1000)
  const router = useRouter()
  const fuseOut = bomb.status === 'ARMED' && new Date(bomb.fuseEndsAt).getTime() <= now
  // Fuse ran out while watching: reload so the server settles the device.
  useEffect(() => {
    if (fuseOut) router.invalidate()
  }, [fuseOut, router])
  if (bomb.status === 'DEFUSED') {
    return (
      <p className="inset flex items-center gap-3 bg-metal-lo px-4 py-2 text-xl text-[#d8d3a6]">
        <span data-on="green" className="lamp size-4" aria-hidden="true" />
        Device defused by <span className="text-amber">{bomb.defusedByCodename ?? 'a guardian'}</span>
        {bomb.defusePoints != null && <span className="text-phos">+{bomb.defusePoints} hero points</span>}
      </p>
    )
  }
  if (bomb.status === 'DETONATED') {
    return (
      <p className="inset flex items-center gap-3 bg-metal-lo px-4 py-2 text-xl text-[#ff7a5c]">
        <span data-on="red" className="lamp size-4" aria-hidden="true" />
        Device detonated at {bomb.siteName}. Fear in the district spiked.
      </p>
    )
  }
  const s = Math.max(0, Math.ceil((new Date(bomb.fuseEndsAt).getTime() - now) / 1000))
  const time = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return (
    <section className="metal overflow-hidden" aria-label="Planted device">
      <div className="hazard h-3" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-4 p-4">
        <span data-on="red" className="lamp size-6 animate-blink" aria-hidden="true" />
        <div className="flex-1">
          <p className="stamp text-lg font-bold text-[#ff7a5c]">Planted device armed</p>
          <p className="leading-tight text-[#d8d3a6]">This glitch is a bomb at {bomb.siteName}. Anyone can defuse it before the fuse runs out.</p>
        </div>
        <span
          className={`readout px-3 text-4xl tabular-nums ${s < 30 ? 'animate-blink text-[#ff3b1f]' : ''}`}
          aria-label={`${s} seconds left`}
          suppressHydrationWarning
        >
          T-{time}
        </span>
        <Link to="/bombs/$glitchId" params={{ glitchId: bomb.glitchId }} className="btn px-6 py-3 text-sm">
          Defuse the device ▸
        </Link>
      </div>
    </section>
  )
}
/** Who the agency blames, and (commanders only) what the residue reading really says. Same strip for every glitch. */
function CaseStrips({ info }: { info: GlitchCase }) {
  const { suspect, residue } = info
  return (
    <div className="flex flex-col gap-2 text-xl leading-tight">
      {suspect && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-[#ff7a5c] px-3 py-1 text-[#ff9a7e]">
          <span>SUSPECT: {suspect.alias ?? '████████'}</span>
          <span className="text-lg text-phos-dim uppercase">{PERSON_STATUS_META[suspect.status].label}</span>
          {suspect.alias && (
            <Link to="/persons/$personId" params={{ personId: suspect.personId }} className="ml-auto text-lg text-amber underline-offset-2 hover:underline">
              Open case file ▸
            </Link>
          )}
        </p>
      )}
      {residue.cleared ? (
        <p className={`border-2 px-3 py-1 ${residue.kind === 'staged' ? 'border-amber/60 text-amber' : 'border-amber text-[#ffd27a]'}`}>
          ◆ CLASSIFIED · {residue.line}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-phos-dim">
          RESIDUE SIGNATURE:
          <Tip text="Classified. Commanders only.">
            <span tabIndex={0} className="cursor-help bg-[#0b0703] text-[#0b0703] select-none" aria-label="Classified">████████████</span>
          </Tip>
        </p>
      )}
    </div>
  )
}

/** Commanders: blame this glitch on a person of interest after the fact. */
function AttributePanel({ glitchId }: { glitchId: string }) {
  const router = useRouter()
  const [people, setPeople] = useState<Awaited<ReturnType<typeof getPersonOptions>> | null>(null)
  const [choice, setChoice] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPersonOptions().then(setPeople, () => setPeople([]))
  }, [])

  async function attribute() {
    if (!choice) return
    setError(null)
    try {
      await attributeGlitch({ data: { glitchId, personId: choice } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.')
    }
  }

  return (
    <div className="metal rivets p-5">
      <h2 className="stamp flex items-center gap-2 text-lg font-bold">
        Attribute
        <InfoTip label="About attribution" text="Name a person of interest as the suspect. Witnesses place them at the scene, their threat level rises and the public hears their name. Blaming someone still free lets them publish a denial." />
      </h2>
      <p className="mt-1 mb-3 leading-tight text-[#d8d3a6]">Nobody is blamed for this glitch yet.</p>
      <label className="block">
        <span className="label mb-2 block">Suspect</span>
        <select
          value={choice}
          onChange={(e) => { setChoice(e.target.value); setError(null) }}
          className="inset w-full bg-[#0b0703] px-2 py-2 text-xl text-phos focus:outline focus:outline-2 focus:outline-amber"
        >
          <option value="">{people === null ? 'Loading files…' : 'Pick a person of interest'}</option>
          {people?.map((p) => (
            <option key={p.personId} value={p.personId}>
              {p.alias} · {PERSON_STATUS_META[p.status].label} · threat {p.heat}
            </option>
          ))}
        </select>
      </label>
      <div aria-live="polite" className="min-h-6 text-lg text-[#ff8a6a]">{error && `✕ ${error}`}</div>
      <HoldButton label="Hold to name the suspect" onConfirm={attribute} className="btn w-full py-3 text-sm">
        {choice ? 'Hold to name the suspect' : 'Pick a suspect first'}
      </HoldButton>
    </div>
  )
}
