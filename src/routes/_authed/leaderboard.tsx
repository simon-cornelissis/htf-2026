import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Medal, type MedalTier } from '#/components/leaderboard/Medal.tsx'
import { Tip } from '#/components/ui/Tooltip.tsx'
import { BADGES, getLeaderboard, SCORING, type Badge, type LeaderboardRow } from '#/lib/leaderboard.functions.ts'
import { canCommand } from '#/lib/glitch.ts'

export const Route = createFileRoute('/_authed/leaderboard')({
  loader: () => getLeaderboard(),
  head: () => ({ meta: [{ title: 'Leaderboard · Guardians of the Grid' }] }),
  component: LeaderboardPage,
})

const authed = getRouteApi('/_authed')

function LeaderboardPage() {
  const rows = Route.useLoaderData()
  const { guardian } = authed.useRouteContext()
  const isCommander = canCommand(guardian.role)
  const scored = rows.filter((r) => r.points > 0)
  const podium = scored.slice(0, 3)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="stamp text-2xl font-bold">Hall of guardians</h1>
        <p className="text-xl leading-tight text-[#d8d3a6]">
          Defenders ranked by points. Report echoes, be first on the scene and defuse devices to climb.
        </p>
        {isCommander && (
          <p className="inset flex items-center gap-3 bg-[#1a140a] px-4 py-2 text-lg text-[#d8d3a6]">
            <span data-on="amber" className="lamp size-3 shrink-0" aria-hidden="true" />
            Commanders aren’t ranked. This board shows your defenders.
          </p>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {scored.length === 0 ? (
            <EmptyBoard hasDefenders={rows.length > 0} />
          ) : (
            <>
              <Podium rows={podium} meId={guardian.guardianId} />
              <Rankings rows={rows} meId={guardian.guardianId} />
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <HowToEarn />
          <BadgeLegend />
        </aside>
      </div>
    </div>
  )
}

function EmptyBoard({ hasDefenders }: { hasDefenders: boolean }) {
  return (
    <section aria-labelledby="empty-heading" className="metal rivets p-5">
      <h2 id="empty-heading" className="stamp mb-3 text-lg font-bold">Rankings</h2>
      <div className="crt rounded-[10px] px-6 py-10 text-center text-2xl">
        <p className="text-phos">&gt; NO SCORES ON FILE YET.</p>
        <p className="mt-2 text-xl text-phos-dim">
          {hasDefenders ? 'The first defender to report an echo takes the top spot.' : 'No defenders have signed up yet.'}
        </p>
      </div>
    </section>
  )
}

/** Top three, laid out 2-1-3 on wide screens and 1-2-3 stacked on phones. */
function Podium({ rows, meId }: { rows: LeaderboardRow[]; meId: string }) {
  const order = ['sm:order-2', 'sm:order-1', 'sm:order-3']
  const lift = ['sm:pb-10', 'sm:pb-5', 'sm:pb-2']
  return (
    <section aria-labelledby="podium-heading" className="metal rivets p-5">
      <h2 id="podium-heading" className="stamp mb-4 text-lg font-bold">Top defenders</h2>
      <ol className="grid gap-4 sm:grid-cols-3 sm:items-end">
        {rows.map((r, i) => {
          const tier = Math.min(r.rank, 3) as MedalTier
          const me = r.guardianId === meId
          return (
            <li key={r.guardianId} className={`${order[i]} ${lift[i]}`}>
              <div className={`inset flex items-center gap-4 bg-[#1a140a] p-4 sm:flex-col sm:text-center ${me ? 'outline-2 outline-amber' : ''}`}>
                <Medal tier={tier} className={tier === 1 ? 'size-16 shrink-0' : 'size-14 shrink-0'} />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:items-center">
                  <p className="font-pixel text-xs text-[#c8c49a]">
                    Rank {r.rank}
                    {me && <span className="ml-2 text-amber">· You</span>}
                  </p>
                  <p className="truncate text-2xl leading-none text-[#f1ecd2]">{r.codename}</p>
                  <p className="readout self-start px-3 py-1 text-2xl leading-none sm:self-center">{r.points} PTS</p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Rankings({ rows, meId }: { rows: LeaderboardRow[]; meId: string }) {
  return (
    <section aria-labelledby="ranks-heading" className="metal rivets p-5">
      <h2 id="ranks-heading" className="stamp mb-4 text-lg font-bold">All defenders · {rows.length}</h2>
      <ol className="flex flex-col gap-3">
        {rows.map((r) => (
          <RankRow key={r.guardianId} row={r} me={r.guardianId === meId} />
        ))}
      </ol>
    </section>
  )
}

function RankRow({ row: r, me }: { row: LeaderboardRow; me: boolean }) {
  const stats = [
    { label: 'Echoes', value: r.echoes },
    { label: 'First reports', value: r.opened },
    { label: 'Fixes helped', value: r.fixesHelped },
    { label: 'Defusals', value: r.defusals },
  ]
  return (
    <li
      className={`inset grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-2 bg-[#1a140a] p-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto] ${me ? 'outline-2 outline-amber' : ''}`}
      aria-current={me ? 'true' : undefined}
    >
      <span className="row-span-2 self-start text-center text-3xl leading-none text-[#c8c49a]">
        <span className="sr-only">Rank {r.rank}</span>
        {r.rank <= 3 && r.points > 0 ? <Medal tier={r.rank as MedalTier} className="mx-auto size-10" /> : <span aria-hidden="true">#{r.rank}</span>}
      </span>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="truncate text-2xl leading-none text-[#f1ecd2]">{r.codename}</span>
        {me && <span className="stamp text-xs text-amber">You</span>}
      </div>

      <span className="readout col-start-2 justify-self-start px-3 py-1 text-2xl leading-none sm:col-start-3 sm:row-start-1 sm:justify-self-end">
        {r.points} PTS
      </span>

      <div className="col-start-2 flex flex-col gap-2 sm:col-span-2">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-lg leading-tight">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <dt className="text-[#c8c49a]">{s.label}</dt>
              <dd className="text-[#f1ecd2]">{s.value}</dd>
            </div>
          ))}
        </dl>
        {r.bestDefuseSecondsLeft !== null && (
          <p className="text-lg leading-tight text-[#d8d3a6]">
            Best defusal with <span className="text-amber">{r.bestDefuseSecondsLeft} s</span> to spare
          </p>
        )}
        {r.badges.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Badges">
            {r.badges.map((b) => (
              <li key={b.id}>
                <BadgeChip badge={b} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <Tip text={badge.hint}>
      <span tabIndex={0} className="inline-block border-2 border-stamp/70 px-2 py-1 font-pixel text-xs leading-none text-stamp">
        {badge.label}
      </span>
    </Tip>
  )
}

function HowToEarn() {
  return (
    <section aria-labelledby="earn-heading" className="metal rivets p-5">
      <h2 id="earn-heading" className="stamp mb-4 text-lg font-bold">How to earn points</h2>
      <ul className="flex flex-col gap-3">
        {Object.values(SCORING).map((s) => (
          <li key={s.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="readout px-2 py-1 text-center text-xl leading-none">+{s.points}</span>
            <span className="text-lg leading-tight text-[#e8e4d0]">{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BadgeLegend() {
  return (
    <section aria-labelledby="badges-heading" className="metal rivets p-5">
      <h2 id="badges-heading" className="stamp mb-4 text-lg font-bold">Badges</h2>
      <dl className="flex flex-col gap-3">
        {Object.values(BADGES).map((b) => (
          <div key={b.id} className="flex flex-col gap-1">
            <dt>
              <span className="inline-block border-2 border-stamp/70 px-2 py-1 font-pixel text-xs leading-none text-stamp">{b.label}</span>
            </dt>
            <dd className="text-lg leading-tight text-[#d8d3a6]">{b.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
