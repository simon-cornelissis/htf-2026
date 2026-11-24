import { getRouteApi, Link, useRouter } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Power } from 'lucide-react'
import { Seal, Tube, Wires } from '#/components/ui/Seal.tsx'
import { TransmitDialog, type TransmitTarget } from '#/components/TransmitDialog.tsx'
import { BombAlert } from '#/components/BombAlert.tsx'
import { ChatDock } from '#/components/chat/ChatDock.tsx'
import { ExposureMeter } from '#/components/persons/ExposureMeter.tsx'
import { AnimatedNumber } from '#/components/ui/AnimatedNumber.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { logout } from '#/lib/auth.functions.ts'
import { DISTRICTS } from '#/lib/districts.ts'
import { canCommand, canReport, continuityIndex, ROLE_LABEL, type GlitchSummary } from '#/lib/glitch.ts'
import { useHotkeys } from '#/lib/useHotkeys.ts'

const authed = getRouteApi('/_authed')

const TransmitContext = createContext<(target?: TransmitTarget) => void>(() => {})

/** Open the "transmit echo" dialog: for a new glitch (optionally in a district) or an existing one. */
export function useTransmit() {
  return useContext(TransmitContext)
}

export function Shell({ children }: { children: ReactNode }) {
  const { guardian } = authed.useRouteContext()
  const glitches = authed.useLoaderData()
  const router = useRouter()
  const [target, setTarget] = useState<TransmitTarget | null>(null)

  const openTransmit = useCallback((t: TransmitTarget = {}) => setTarget(t), [])

  // CUSTODIAN, the chat assistant: mounted once the operator first opens it.
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMounted, setChatMounted] = useState(false)
  const toggleChat = useCallback(() => {
    setChatMounted(true)
    setChatOpen((o) => !o)
  }, [])

  useHotkeys({ e: () => openTransmit(), c: toggleChat })

  const roleName = ROLE_LABEL[guardian.role].toUpperCase()
  // Demo codenames already carry the role ("COMMANDER", "DEFENDER1"): don't say it twice.
  const showRole = !guardian.codename.toUpperCase().includes(roleName)

  async function signOut() {
    await logout()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  return (
    <TransmitContext.Provider value={openTransmit}>
      <div className="flex min-h-screen flex-col">
        <header className="metal rivets z-10">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-8 gap-y-4 px-4 py-4 sm:px-6 lg:px-10">
            <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Guardians of the Grid, home">
              <span className="inset flex size-12 shrink-0 items-center justify-center bg-metal-lo sm:size-14">
                <Seal className="size-9 sm:size-10" />
              </span>
              <div className="min-w-0">
                <div className="stamp text-lg leading-none font-bold sm:text-xl">Guardians of the Grid</div>
                <div className="mt-1 hidden text-lg leading-none text-ink-dim sm:block">ACHRONA REGIONAL TERMINAL · DAY 412</div>
              </div>
            </Link>

            <IntegrityGauge glitches={glitches} />

            {/* Second meter only where there's room: the header stays two rows at most on phones. */}
            <div className="hidden md:block">
              <ExposureMeter />
            </div>

            <div className="hidden items-end gap-1 opacity-80 2xl:flex" aria-hidden="true">
              <Tube className="h-12 w-6" />
              <Tube className="h-14 w-6" />
            </div>

            <div className="ml-auto flex items-center gap-4">
              <Tip
                text={
                  guardian.role === 'admin'
                    ? 'Signed in as an admin: commander powers, plus overriding AI decisions and handling moderation escalations.'
                    : guardian.role === 'commander'
                      ? 'Signed in as a commander: you can change glitch status, delete files and plan operations.'
                      : guardian.role === 'defender'
                        ? 'Signed in as a defender: you can report echoes, defuse devices and follow glitches.'
                        : 'Signed in as a guardian: read-only. You can follow glitches, search and ask questions.'
                }
              >
              <div className="flex items-center gap-3" tabIndex={0}>
                <span aria-hidden="true" data-on={canCommand(guardian.role) ? 'amber' : canReport(guardian.role) ? 'green' : undefined} className="lamp size-3.5" />
                <div className="readout px-3 py-1 leading-none">
                  <div className="text-2xl">{guardian.codename}</div>
                  {showRole && <div className="text-lg text-[#d89a2e]">{roleName}</div>}
                </div>
              </div>
              </Tip>
              <button
                type="button"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
                className="group flex items-center gap-2"
              >
                <span data-on="red" className="lamp flex size-8 items-center justify-center text-white/80">
                  <Power className="size-4" />
                </span>
                <span className="hidden text-lg leading-none text-ink-dim uppercase group-hover:text-ink sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <nav aria-label="Main" className="metal">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-10">
            <Link to="/" className="btn px-4 py-2 text-sm" activeOptions={{ exact: true, includeSearch: false }} activeProps={{ 'aria-current': 'page', className: 'btn btn-primary px-4 py-2 text-sm' }}>
              World map
            </Link>
            <Link to="/leaderboard" className="btn px-4 py-2 text-sm" activeProps={{ 'aria-current': 'page', className: 'btn btn-primary px-4 py-2 text-sm' }}>
              Leaderboard
            </Link>
            <Tip text="Case files on Desync members and sympathisers: status, wanted level and every report on file.">
              <Link to="/persons" className="btn px-4 py-2 text-sm" activeProps={{ 'aria-current': 'page', className: 'btn btn-primary px-4 py-2 text-sm' }}>
                Persons of interest
              </Link>
            </Tip>
            <Tip text="Connect Claude (Claude Code or Claude Desktop) to Achrona and let it act for you, with your role's permissions.">
              <Link to="/mcp" className="btn px-4 py-2 text-sm" activeProps={{ 'aria-current': 'page', className: 'btn btn-primary px-4 py-2 text-sm' }}>
                MCP access
              </Link>
            </Tip>
            <Tip className="ml-auto" text="CUSTODIAN, the agency's terminal intelligence. Ask it questions or have it act for you; it asks before changing anything. Shortcut: C.">
              <button
                type="button"
                onClick={toggleChat}
                aria-expanded={chatOpen}
                aria-pressed={chatOpen}
                className="btn flex items-center gap-2 px-4 py-2 text-sm"
              >
                <span aria-hidden="true" data-on={chatOpen ? 'green' : undefined} className="lamp size-2.5" />
                Custodian
              </button>
            </Tip>
          </div>
        </nav>

        <BombAlert />

        <RadioStrip glitches={glitches} />

        <main className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 px-4 py-8 sm:px-6 lg:px-10">{children}</main>

        <footer className="metal relative">
          <Wires className="pointer-events-none absolute -top-10 right-10 hidden h-10 w-20 opacity-80 xl:block" />
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-10">
            <Key k="J/K">Browse</Key>
            <Key k="Enter">Open</Key>
            <Key k="E">Transmit</Key>
            <Key k="C">Custodian</Key>
            <Key k="/">Search</Key>
            <span className="hazard ml-auto hidden h-4 w-24 sm:block" aria-hidden="true" />
          </div>
        </footer>
      </div>

      <TransmitDialog target={target} onClose={() => setTarget(null)} />
      {chatMounted && <ChatDock open={chatOpen} onClose={() => setChatOpen(false)} role={guardian.role} />}
    </TransmitContext.Provider>
  )
}

function Key({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Kbd>{k}</Kbd>
      <span className="text-lg leading-none text-ink-dim uppercase">{children}</span>
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="btn px-2 py-0.5 text-xs">{children}</kbd>
}

/** LED bar + amber digits: how intact the grid is. Red and blinking below 60%. */
function IntegrityGauge({ glitches }: { glitches: GlitchSummary[] }) {
  const index = continuityIndex(glitches)
  const segments = 20
  const lit = Math.round((index / 100) * segments)
  const critical = index < 60

  return (
    <div className="flex items-center gap-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={index} aria-label="Grid integrity">
      <div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <span className="label">Grid integrity</span>
            <InfoTip label="What is grid integrity?" text="How intact Achrona's grid is. Every open glitch drains it: leaked ones the most, contained ones the least. Below 60% the grid goes critical." />
          </span>
          {critical && <span className="label text-[#ff6a4e] animate-blink">Critical</span>}
        </div>
        <div className="inset mt-1.5 flex gap-[2px] bg-[#0b0703] p-1.5" aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => {
            const on = i < lit
            const color = critical ? '#ff3a22' : i < 5 ? '#ffb22e' : '#6dff55'
            return (
              <span
                key={i}
                className="h-4 w-1.5 sm:w-2"
                style={{ background: on ? color : '#1c1a12', boxShadow: on ? `0 0 6px ${color}` : undefined }}
              />
            )
          })}
        </div>
      </div>
      <div className={`readout px-2.5 py-0.5 text-4xl leading-none sm:text-5xl ${critical ? 'text-[#ff5a3a] animate-flicker' : ''}`}>
        <AnimatedNumber value={index} pad={3} />
        <span className="text-2xl">%</span>
      </div>
    </div>
  )
}

/** Intercepted radio traffic on a strip CRT: newest open glitches plus broadcasts. */
function RadioStrip({ glitches }: { glitches: GlitchSummary[] }) {
  const items = useMemo(() => {
    const open = glitches.filter((g) => g.status !== 'FIXED').slice(0, 6)
    const broadcasts = ['Report every echo you hear', 'Stay off the river after dark', 'Unreported echoes feed the Desync']
    const out: string[] = []
    open.forEach((g, i) => {
      out.push(`${g.glitchId} ${g.status} IN ${DISTRICTS[g.district].name} - ${g.description}`)
      if (i % 2 === 1) out.push(broadcasts[(i >> 1) % broadcasts.length])
    })
    if (out.length === 0) out.push('All districts quiet', ...broadcasts)
    return out
  }, [glitches])

  const line = items.map((t) => `> ${t}`).join('      ')
  return (
    <div className="metal hidden items-stretch gap-3 px-3 py-1.5 md:flex" aria-hidden="true">
      <div className="flex shrink-0 items-center px-1.5">
        <span className="label">Radio</span>
      </div>
      <div className="crt min-w-0 flex-1 rounded-[6px] px-3 py-0.5">
        <div className="inline-block animate-ticker whitespace-nowrap text-xl text-phos-mid uppercase">
          {line}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{line}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </div>
      </div>
    </div>
  )
}
