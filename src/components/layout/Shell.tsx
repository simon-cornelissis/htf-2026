import { getRouteApi, Link, useRouter } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Power } from 'lucide-react'
import { Seal, Tube, Wires } from '#/components/ui/Seal.tsx'
import { TransmitDialog, type TransmitTarget } from '#/components/TransmitDialog.tsx'
import { logout } from '#/lib/auth.functions.ts'
import { DISTRICTS } from '#/lib/districts.ts'
import { continuityIndex, type GlitchSummary } from '#/lib/glitch.ts'
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

  useHotkeys({ e: () => openTransmit() })

  async function signOut() {
    await logout()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  return (
    <TransmitContext.Provider value={openTransmit}>
      <div className="flex min-h-screen flex-col">
        <header className="metal rivets z-10">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4 lg:px-10">
            <Link to="/" className="flex items-center gap-3" aria-label="Guardians of the Grid, home">
              <span className="inset flex size-14 items-center justify-center bg-metal-lo">
                <Seal className="size-10" />
              </span>
              <div>
                <div className="stamp text-xl leading-none font-bold">Guardians of the Grid</div>
                <div className="mt-1 text-lg leading-none text-[#c8c49a]">ACHRONA REGIONAL TERMINAL · DAY 412</div>
              </div>
            </Link>

            <IntegrityGauge glitches={glitches} />

            <div className="hidden items-end gap-1 xl:flex" aria-hidden="true">
              <Tube className="h-16 w-7" />
              <Tube className="h-20 w-8" />
              <Tube className="h-16 w-7" />
            </div>

            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" data-on={guardian.role === 'commander' ? 'amber' : 'green'} className="lamp size-3.5" />
                <div className="readout px-3 py-1 leading-none">
                  <div className="text-2xl">{guardian.codename}</div>
                  <div className="text-base text-[#c98a1e]">
                    {guardian.role === 'commander' ? 'CMDR' : 'DEF'} · {guardian.guardianId}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
                className="flex flex-col items-center gap-1"
              >
                <span data-on="red" className="lamp flex size-9 items-center justify-center text-white/80">
                  <Power className="size-4" />
                </span>
                <span className="stamp text-[10px]">Off</span>
              </button>
            </div>
          </div>
        </header>

        <RadioStrip glitches={glitches} />

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-8 lg:px-10">{children}</main>

        <footer className="metal relative">
          <Wires className="pointer-events-none absolute -top-14 right-10 hidden h-14 w-24 md:block" />
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 lg:px-10">
            <Key k="J/K">Browse</Key>
            <Key k="Enter">Open</Key>
            <Key k="E">Transmit</Key>
            <Key k="/">Search</Key>
            <span className="hazard ml-auto hidden h-6 w-32 sm:block" aria-hidden="true" />
          </div>
        </footer>
      </div>

      <TransmitDialog target={target} onClose={() => setTarget(null)} />
    </TransmitContext.Provider>
  )
}

function Key({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Kbd>{k}</Kbd>
      <span className="stamp text-xs">{children}</span>
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="btn px-2 py-0.5 text-[11px]">{children}</kbd>
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
          <span className="stamp text-xs">Grid integrity</span>
          {critical && <span className="font-pixel text-xs text-[#ff6a4e] uppercase animate-blink">Critical</span>}
        </div>
        <div className="inset mt-1.5 flex gap-[2px] bg-[#0b0703] p-1.5" aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => {
            const on = i < lit
            const color = critical ? '#ff3a22' : i < 5 ? '#ffb22e' : '#6dff55'
            return (
              <span
                key={i}
                className="h-4 w-2"
                style={{ background: on ? color : '#1c1a12', boxShadow: on ? `0 0 6px ${color}` : undefined }}
              />
            )
          })}
        </div>
      </div>
      <div className={`readout px-2.5 py-0.5 text-5xl leading-none ${critical ? 'text-[#ff5a3a] animate-flicker' : ''}`}>
        {String(index).padStart(3, '0')}
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
    <div className="metal flex items-stretch gap-3 px-3 py-2" aria-hidden="true">
      <div className="hazard flex shrink-0 items-center px-1.5">
        <span className="bg-[#141208] px-2 py-0.5 font-pixel text-xs text-stamp">Radio</span>
      </div>
      <div className="crt min-w-0 flex-1 rounded-[6px] px-3 py-0.5">
        <div className="inline-block animate-ticker whitespace-nowrap text-xl text-phos uppercase">
          {line}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{line}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        </div>
      </div>
    </div>
  )
}
