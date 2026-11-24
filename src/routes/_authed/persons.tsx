import { createFileRoute, getRouteApi, Link, Outlet, useChildMatches } from '@tanstack/react-router'
import { HeatMeter, IdBadge, StatusLamp } from '#/components/persons/Dossier.tsx'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { InfoTip } from '#/components/ui/Tooltip.tsx'
import { DISTRICTS } from '#/lib/districts.ts'
import { canCommand } from '#/lib/glitch.ts'
import { getPersons } from '#/lib/persons.functions.ts'
import { PERSON_STATUSES, PERSON_STATUS_META, type PersonCard } from '#/lib/persons.ts'

export const Route = createFileRoute('/_authed/persons')({
  loader: () => getPersons(),
  head: () => ({ meta: [{ title: 'Persons of interest · Guardians of the Grid' }] }),
  component: PersonsLayout,
})

const authed = getRouteApi('/_authed')

/** The index, or a case file when one is open (persons.$personId renders in the outlet). */
function PersonsLayout() {
  const children = useChildMatches()
  if (children.length > 0) return <Outlet />
  return <PersonsIndex />
}

function PersonsIndex() {
  const people = Route.useLoaderData()
  const { guardian } = authed.useRouteContext()
  const isCommander = canCommand(guardian.role)
  const counts = PERSON_STATUSES.map((s) => ({ s, n: people.filter((p) => p.status === s).length })).filter((c) => c.n > 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="stamp text-2xl font-bold">Persons of interest</h1>
          <InfoTip
            label="About persons of interest"
            text="Known members and sympathisers of the Desync network. Open a dossier to read its case file: intercepts, sightings, and the incidents the agency holds them responsible for."
          />
        </div>
        <p className="text-xl leading-tight text-[#d8d3a6]">
          The Desync network, as known to the Guardians. Report any sighting. Do not engage in conversation: their words are the weapon.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-lg text-ink-dim uppercase">
          {counts.map(({ s, n }) => (
            <span key={s}>{n} {PERSON_STATUS_META[s].label}</span>
          ))}
        </p>
        {isCommander && (
          <p className="inset flex items-center gap-3 bg-[#1a140a] px-4 py-2 text-lg text-[#d8d3a6]">
            <span data-on="amber" className="lamp size-3 shrink-0" aria-hidden="true" />
            Your clearance shows real names and the classified line on every file. Defenders see the official profile only.
          </p>
        )}
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => (
          <li key={p.personId}>
            <DossierCard person={p} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function DossierCard({ person: p }: { person: PersonCard }) {
  const erased = p.status === 'ERASED'
  return (
    <Link
      to="/persons/$personId"
      params={{ personId: p.personId }}
      className={`metal rivets group flex h-full flex-col gap-3 p-4 hover:outline hover:outline-2 hover:outline-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${erased ? 'opacity-70 grayscale' : ''}`}
      aria-label={`Open the case file of ${p.alias ?? 'a withdrawn record'}`}
    >
      <div className="flex items-start gap-4">
        <IdBadge personId={p.personId} status={p.status} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-pixel text-xs text-ink-dim">{p.personId}</span>
            <StatusLamp status={p.status} />
          </div>
          <p className="stamp mt-1 truncate text-xl font-bold">{p.alias ?? '████████'}</p>
          <p className="truncate text-xl leading-tight text-ink">
            {p.realName ?? <span className="text-ink-dim">{erased ? 'Record withdrawn' : 'Name classified'}</span>}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 min-h-[2.5em] text-xl leading-tight text-ink-dim">
        {p.role ?? 'This file was erased by order of the Guardians.'}
      </p>
      {!erased && <HeatMeter heat={p.heat} />}
      <div className="mt-auto flex items-center justify-between gap-2 text-lg text-ink-dim uppercase">
        <span>{DISTRICTS[p.district]?.name ?? p.district}</span>
        <span>
          {p.entryCount} {p.entryCount === 1 ? 'entry' : 'entries'}
          {p.lastEntryAt && <> · <RelativeTime iso={p.lastEntryAt} /></>}
        </span>
      </div>
      <span className="label text-amber opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
        Open case file ▸
      </span>
    </Link>
  )
}
