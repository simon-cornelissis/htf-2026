import { createFileRoute, getRouteApi, Link, notFound, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { HeatMeter, IdBadge, Redacted, StatusLamp } from '#/components/persons/Dossier.tsx'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { formatFull, RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { DISTRICTS } from '#/lib/districts.ts'
import { canCommand } from '#/lib/glitch.ts'
import { actOnPerson, addCaseNote, getPerson, type PersonAction } from '#/lib/persons.functions.ts'
import { CASE_KIND_META, isFree, PERSON_STATUS_META, WANTED_HEAT, type CaseEntryView, type PersonFile } from '#/lib/persons.ts'

export const Route = createFileRoute('/_authed/persons/$personId')({
  loader: async ({ params }) => {
    const person = await getPerson({ data: params.personId })
    if (!person) throw notFound()
    return person
  },
  head: ({ params }) => ({ meta: [{ title: `Case file ${params.personId} · Guardians of the Grid` }] }),
  notFoundComponent: () => (
    <div className="crt mx-auto max-w-xl px-8 py-16 text-center text-2xl">
      <p className="text-5xl text-phos">NO SUCH FILE</p>
      <p className="mt-3 text-phos-dim">The agency holds no record under that number.</p>
      <Link to="/persons" className="btn mt-8 inline-block px-6 py-3 text-sm">Back to persons of interest</Link>
    </div>
  ),
  component: CaseFilePage,
})

const authed = getRouteApi('/_authed')
const stamp = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function CaseFilePage() {
  const person = Route.useLoaderData()
  const { guardian } = authed.useRouteContext()
  const isCommander = canCommand(guardian.role)
  const erased = person.status === 'ERASED'

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/persons" className="btn px-4 py-2 text-xs">◀ Persons of interest</Link>
        <span className="readout px-3 py-0.5 text-2xl">CASE FILE {person.personId}</span>
      </div>

      {erased && !isCommander ? (
        <div className="crt px-8 py-16 text-center text-2xl">
          <p className="text-5xl text-phos-dim">RECORD WITHDRAWN</p>
          <p className="mt-3 text-phos-dim">This file was erased by order of the Guardians. There is nothing here. There never was.</p>
          <p className="mt-6 text-phos-dim/70" aria-hidden="true">████████ ██████ ████ █████████ ███</p>
        </div>
      ) : (
        <>
          <Header person={person} isCommander={isCommander} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Timeline entries={person.entries} />
            {isCommander && (
              <aside className="flex flex-col gap-5">
                <Orders person={person} />
                <AddNote personId={person.personId} disabled={erased} />
              </aside>
            )}
            {!isCommander && (
              <aside className="flex flex-col gap-5">
                <div className="metal rivets p-5">
                  <h2 className="stamp text-lg font-bold">Seen this person?</h2>
                  <p className="mt-1 leading-tight text-[#d8d3a6]">
                    Report the sighting as an echo on the glitch nearest to where you saw them. Do not approach. Do not listen.
                  </p>
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </article>
  )
}

function Header({ person: p, isCommander }: { person: PersonFile; isCommander: boolean }) {
  const erased = p.status === 'ERASED'
  return (
    <div className={`metal rivets relative grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)] ${erased ? 'grayscale' : ''}`}>
      <IdBadge personId={p.personId} status={p.status} size={132} />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="stamp text-3xl font-bold">{p.alias}</h1>
          <StatusLamp status={p.status} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xl leading-tight">
          <dt className="label pt-1">Name</dt>
          <dd className="text-ink">
            {p.realName ?? <Redacted length={14} label="Real name classified" />}
            {isCommander && <span className="ml-2 font-pixel text-xs text-amber">Classified</span>}
          </dd>
          <dt className="label pt-1">Role</dt>
          <dd className="text-ink">{p.role}</dd>
          <dt className="label pt-1">Last seen</dt>
          <dd className="text-ink">{DISTRICTS[p.district]?.name ?? p.district}</dd>
          <dt className="label pt-1">Attributed</dt>
          <dd className="text-ink">
            {p.attributions} {p.attributions === 1 ? 'incident' : 'incidents'}
          </dd>
        </dl>
        {!erased && <HeatMeter heat={p.heat} />}

        <div className="inset bg-[#14110a] px-4 py-3">
          <p className="label mb-1">Official profile</p>
          <p className="text-xl leading-tight text-ink">{p.profile}</p>
        </div>
        {isCommander && p.truth ? (
          <div className="border-2 border-amber bg-[#1a140a] px-4 py-3">
            <p className="label mb-1 text-amber">◆ Classified · commanders only</p>
            <p className="text-xl leading-tight text-[#ffd27a]">{p.truth}</p>
          </div>
        ) : (
          <p className="text-xl leading-tight text-ink-dim">
            <span className="label mr-2">Classified annex</span>
            <Redacted length={90} label="Classified annex" />
          </p>
        )}
      </div>
      {erased && (
        <span className="stamp pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 border-4 border-[#ff5a3a] px-4 py-1 text-3xl font-bold text-[#ff5a3a] opacity-80">
          Erased
        </span>
      )}
    </div>
  )
}

function Timeline({ entries }: { entries: CaseEntryView[] }) {
  const newestFirst = [...entries].reverse()
  return (
    <section aria-labelledby="timeline-heading" className="metal rivets p-5">
      <div className="mb-3 flex items-center gap-2 px-1">
        <h2 id="timeline-heading" className="stamp text-lg font-bold">
          Case file · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </h2>
        <InfoTip label="About the case file" text="Everything the agency holds on this person, newest first: intercepted messages, sightings, incidents attributed to them, orders and agency notes. Black bars are classified." />
      </div>
      <div className="crt p-5 text-[22px]">
        {entries.length === 0 ? (
          <p className="text-phos-dim">&gt; FILE EMPTY.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {newestFirst.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

const KIND_TONE: Record<CaseEntryView['kind'], string> = {
  INTERCEPT: 'text-phos-dim',
  SIGHTING: 'text-phos-dim',
  ATTRIBUTION: 'text-[#ff7a5c]',
  NOTE: 'text-amber',
  ACTION: 'text-amber',
  LEAK: 'text-[#ffd27a]',
}

function Entry({ entry: e }: { entry: CaseEntryView }) {
  const meta = CASE_KIND_META[e.kind]
  return (
    <li className="leading-tight">
      <div className="flex flex-wrap items-center gap-x-3 text-lg uppercase">
        <Tip text={meta.hint}>
          <span tabIndex={0} className={KIND_TONE[e.kind]}>[{meta.label}]</span>
        </Tip>
        <time dateTime={e.timestamp} title={formatFull(e.timestamp)} className="text-phos-dim" suppressHydrationWarning>
          {stamp.format(new Date(e.timestamp))}
        </time>
        <RelativeTime iso={e.timestamp} className="text-phos-dim" />
        {e.classified && <span className="text-amber">◆ Classified</span>}
        {e.authorCodename && <span className="text-phos-dim">by {e.authorCodename}</span>}
        {e.operationId && <span className="text-amber">{e.operationId}</span>}
      </div>
      {e.body === null ? (
        <p className="mt-1">
          <Redacted length={e.length} />
        </p>
      ) : e.kind === 'INTERCEPT' ? (
        <div className="mt-1 border-l-2 border-phos-dim/60 pl-3">
          <p className="text-lg text-phos-dim">-- BEGIN INTERCEPT --</p>
          <p className="text-phos">{e.body}</p>
          <p className="text-lg text-phos-dim">-- END --</p>
        </div>
      ) : e.kind === 'LEAK' ? (
        <p className="mt-1 border-2 border-dashed border-[#ffd27a]/70 px-3 py-1 text-[#ffd27a]">⚠ Reached the public: {e.body}</p>
      ) : (
        <p className={e.kind === 'ATTRIBUTION' ? 'mt-1 text-[#ff9a7e]' : 'mt-1 text-phos'}>&gt; {e.body}</p>
      )}
      {e.glitchId && (
        <Link to="/glitches/$glitchId" params={{ glitchId: e.glitchId }} className="btn mt-2 inline-block px-3 py-1 text-xs">
          Open {e.glitchId} ▸
        </Link>
      )}
    </li>
  )
}

const ORDER_COPY: Record<PersonAction, { label: string; hint: string; done: string }> = {
  warrant: { label: 'Issue warrant', hint: `Sets them to Wanted. Every post looks for them. Threat level goes to at least ${WANTED_HEAT}.`, done: 'Warrant issued.' },
  detain: { label: 'Detain', hint: 'Takes them into agency custody. They stop publishing, and the cover-up holds better.', done: 'Detained.' },
  erase: { label: 'Erase record', hint: 'Withdraws them from every public record. Defenders will find an empty file. Cannot be undone.', done: 'Record erased.' },
}

function Orders({ person: p }: { person: PersonFile }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const free = isFree(p.status)
  const erased = p.status === 'ERASED'

  async function order(action: PersonAction) {
    setMessage(null)
    try {
      await actOnPerson({ data: { personId: p.personId, action } })
      await router.invalidate()
      setMessage({ tone: 'ok', text: ORDER_COPY[action].done })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'The order didn’t go through. Try again.' })
    }
  }

  // One forward step at a time: warrant, then detention. Erasure sits apart, behind the hazard stripe.
  const primary: PersonAction | null = p.status === 'AT_LARGE' ? 'warrant' : p.status === 'WANTED' ? 'detain' : null
  const secondary: PersonAction | null = p.status === 'AT_LARGE' ? 'detain' : null

  return (
    <>
      <div className="metal rivets p-5">
        <h2 className="stamp text-lg font-bold">Orders</h2>
        <p className="mt-1 mb-4 leading-tight text-[#d8d3a6]">
          {erased ? 'This record is closed.' : `Status: ${PERSON_STATUS_META[p.status].label}. ${PERSON_STATUS_META[p.status].hint}`}
        </p>
        {primary && (
          <Tip text={ORDER_COPY[primary].hint} className="w-full">
            <HoldButton label={`Hold to ${ORDER_COPY[primary].label.toLowerCase()} for ${p.alias}`} onConfirm={() => order(primary)} className="btn btn-primary w-full py-3 text-sm">
              Hold to {ORDER_COPY[primary].label.toLowerCase()}
            </HoldButton>
          </Tip>
        )}
        {secondary && (
          <Tip text={ORDER_COPY[secondary].hint} className="mt-3 w-full">
            <HoldButton label={`Hold to detain ${p.alias}`} onConfirm={() => order(secondary)} className="btn w-full py-2.5 text-sm">
              Hold to detain now
            </HoldButton>
          </Tip>
        )}
        {!free && !erased && <p className="text-xl leading-tight text-ink-dim">In custody. Nothing left to order but erasure.</p>}
        <div aria-live="polite" className={`mt-2 min-h-6 text-lg ${message?.tone === 'error' ? 'text-[#ff8a6a]' : 'text-[#9dff86]'}`}>
          {message?.text}
        </div>
      </div>

      {!erased && (
        <div className="metal overflow-hidden">
          <div className="hazard h-4" aria-hidden="true" />
          <div className="p-5">
            <h2 className="stamp text-lg font-bold text-[#ff7a5c]">Erase record</h2>
            <p className="mt-1 mb-4 leading-tight text-[#d8d3a6]">{ORDER_COPY.erase.hint}</p>
            <HoldButton label={`Hold to erase the record of ${p.alias}`} onConfirm={() => order('erase')} holdMs={1600} className="btn w-full py-3 text-sm">
              Hold to erase
            </HoldButton>
          </div>
        </div>
      )}
    </>
  )
}

function AddNote({ personId, disabled }: { personId: string; disabled: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [classified, setClassified] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    try {
      await addCaseNote({ data: { personId, body, classified } })
      setBody('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t file the note. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="metal rivets p-5">
      <h2 className="stamp text-lg font-bold">Add note</h2>
      <label className="mt-3 block">
        <span className="label mb-2 block">Note for the file</span>
        <div className="crt rounded-[10px] p-3">
          <textarea
            rows={3}
            maxLength={400}
            value={body}
            disabled={disabled}
            onChange={(e) => { setBody(e.target.value); setError(null) }}
            placeholder="Seen at the Long Stalls again, carrying paper."
            className="relative z-10 w-full resize-y bg-transparent text-xl leading-tight text-phos caret-phos placeholder:text-phos-dim/60 focus:outline-none"
          />
        </div>
      </label>
      <label className="mt-3 flex items-center gap-3 text-xl leading-tight text-ink">
        <input type="checkbox" checked={classified} onChange={(e) => setClassified(e.target.checked)} className="size-5 accent-[#ffb22e]" />
        Classified
        <InfoTip label="About classified notes" text="Classified notes show up as black bars for defenders and guardians. Leave it unticked for notes everyone may read." />
      </label>
      <div aria-live="polite" className="min-h-6 text-lg text-[#ff8a6a]">{error && `✕ ${error}`}</div>
      <button type="submit" disabled={disabled || pending || body.trim().length < 3} className="btn w-full py-3 text-sm">
        {pending ? 'Filing…' : 'File note'}
      </button>
    </form>
  )
}
