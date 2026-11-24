import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_STRIKES, STRIKE_PENALTY_SECONDS, type WireColor } from '#/lib/bomb.ts'
import { cutWire, getBomb, type BombState } from '#/lib/bombs.functions.ts'
import { DISTRICTS } from '#/lib/districts.ts'
import { useNow } from '#/lib/useNow.ts'

const POLL_MS = 2000

const WIRE_FILL: Record<WireColor, { base: string; hi: string; lo: string }> = {
  red: { base: '#d0342a', hi: '#ff6a55', lo: '#7a1a14' },
  blue: { base: '#2c66cc', hi: '#6a9cff', lo: '#163a7a' },
  yellow: { base: '#e8b923', hi: '#ffe36a', lo: '#8a6a0e' },
  green: { base: '#3a9e45', hi: '#74d67c', lo: '#1d5a24' },
  white: { base: '#dcd9cc', hi: '#ffffff', lo: '#8c897c' },
  black: { base: '#232323', hi: '#5a5a5a', lo: '#0a0a0a' },
}

const KEYFRAMES = `
@keyframes defuse-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-8px, 2px); }
  30% { transform: translate(7px, -3px); }
  45% { transform: translate(-6px, 3px); }
  60% { transform: translate(5px, -2px); }
  75% { transform: translate(-3px, 1px); }
}
@keyframes defuse-flash {
  0% { background: #fff; opacity: 1; }
  25% { background: #fff; opacity: 1; }
  100% { background: #b3170c; opacity: 0; }
}
@keyframes defuse-spark {
  0% { opacity: 1; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.8); }
}
@keyframes defuse-rise {
  0% { opacity: 0; transform: translateY(16px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
`

function secondsLeft(iso: string, now: number) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000))
}

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** The defuse screen: wires, fuse, strike lamps and the manual. */
export function DefuseGame({ initial }: { initial: BombState }) {
  const [bomb, setBomb] = useState(initial)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [spark, setSpark] = useState<{ wire: number; key: number } | null>(null)
  const wasArmed = useRef(initial.status === 'ARMED')
  const now = useNow(250)

  const armed = bomb.status === 'ARMED'
  const left = secondsLeft(bomb.fuseEndsAt, now)

  const refresh = useCallback(async () => {
    try {
      const next = await getBomb({ data: initial.glitchId })
      if (next) setBomb(next)
    } catch {
      // Try again on the next tick.
    }
  }, [initial.glitchId])

  // Other guardians may be cutting too: keep the device in sync while it ticks.
  useEffect(() => {
    if (!armed) return
    const id = setInterval(() => {
      if (!pending) refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [armed, pending, refresh])

  // Fuse ran out locally: ask the server to settle it right away.
  const askedAtZero = useRef(false)
  useEffect(() => {
    if (armed && left === 0 && !askedAtZero.current) {
      askedAtZero.current = true
      refresh()
    }
    if (left > 0) askedAtZero.current = false
  }, [armed, left, refresh])

  async function cut(wire: number) {
    if (pending || !armed) return
    setPending(true)
    setMessage(null)
    try {
      const { result, state } = await cutWire({ data: { glitchId: bomb.glitchId, wire } })
      setBomb(state)
      if (result === 'wrong') {
        setShakeKey((k) => k + 1)
        setSpark({ wire, key: Date.now() })
        setMessage({ tone: 'error', text: `Wrong wire! −${STRIKE_PENALTY_SECONDS} s` })
      } else if (result === 'correct') {
        setMessage({ tone: 'ok', text: 'Clean cut. Next step.' })
      } else if (result === 'already-resolved') {
        setMessage({ tone: 'error', text: 'Too late, this device is already settled.' })
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'The cut didn’t go through. Try again.' })
    } finally {
      setPending(false)
    }
  }

  const district = DISTRICTS[bomb.district]
  const districtName = district?.name ?? bomb.district
  const { wires, manual, cut: cuts, strikes } = bomb.puzzle
  const step = cuts.length
  const critical = armed && left < 30

  return (
    <article className="flex flex-col gap-6">
      <style>{KEYFRAMES}</style>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/glitches/$glitchId" params={{ glitchId: bomb.glitchId }} className="btn px-4 py-2 text-xs">
          ◀ Back to {bomb.glitchId}
        </Link>
        <span className="readout px-3 py-0.5 text-2xl uppercase">
          {bomb.siteName} · {districtName}
        </span>
      </div>

      {bomb.status === 'DEFUSED' && <DefusedScreen bomb={bomb} />}
      {bomb.status === 'DETONATED' && <DetonatedScreen bomb={bomb} districtName={districtName} flash={wasArmed.current} />}

      {armed && (
        <div
          key={shakeKey}
          className="metal rivets grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
          style={shakeKey ? { animation: 'defuse-shake 420ms steps(6) 1' } : undefined}
        >
          {/* The device */}
          <section aria-labelledby="device-heading" className="flex flex-col gap-4">
            <div className="hazard h-4" aria-hidden="true" />
            <div className="flex flex-wrap items-end justify-between gap-4 px-1">
              <div>
                <h1 id="device-heading" className="stamp text-2xl font-bold">Planted device</h1>
                <p className="leading-tight text-[#d8d3a6]">
                  Cut the wires in the order the manual gives. One click cuts. A wrong cut burns {STRIKE_PENALTY_SECONDS} s of fuse.
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="stamp text-[12px]">Fuse</span>
                <span
                  className={`readout px-4 text-[clamp(3.5rem,9vw,5.5rem)] leading-none tabular-nums ${critical ? 'animate-blink text-[#ff3b1f]' : ''}`}
                  role="timer"
                  aria-label={`${left} seconds left`}
                  suppressHydrationWarning
                >
                  {mmss(left)}
                </span>
              </div>
            </div>

            {/* Wires */}
            <div className="inset relative bg-edge px-4 pt-3 pb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="stamp text-[12px]">Strikes</span>
                <span className="flex gap-2" aria-label={`${strikes} of ${MAX_STRIKES} strikes`}>
                  {Array.from({ length: MAX_STRIKES }, (_, i) => (
                    <span key={i} data-on={i < strikes ? 'red' : undefined} className="lamp size-6" aria-hidden="true" />
                  ))}
                </span>
              </div>
              <div className="flex justify-around gap-2" aria-hidden="true">
                {wires.map((_, i) => (
                  <span key={i} className="font-pixel w-14 text-center text-[12px] text-stamp">{i + 1}</span>
                ))}
              </div>
              <div className="h-5 border-4 border-black bg-[#4a4a44]" aria-hidden="true" />
              <ul className="flex justify-around gap-2">
                {wires.map((color, i) => {
                  const isCut = cuts.includes(i)
                  return (
                    <li key={i} className="relative flex flex-col items-center">
                      <Wire
                        color={color}
                        index={i}
                        isCut={isCut}
                        disabled={pending || isCut}
                        onCut={() => cut(i)}
                      />
                      {spark?.wire === i && (
                        <span
                          key={spark.key}
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 left-1/2 -mt-6 -ml-6 size-12 rounded-full"
                          style={{
                            background: 'radial-gradient(circle, #fff 0 20%, #ffd23a 21% 45%, transparent 46%)',
                            animation: 'defuse-spark 500ms steps(5) forwards',
                          }}
                        />
                      )}

                    </li>
                  )
                })}
              </ul>
              <div className="h-5 border-4 border-black bg-[#4a4a44]" aria-hidden="true" />
            </div>

            <div aria-live="assertive" className="min-h-8 px-1 font-pixel text-sm uppercase">
              {message && (
                <span className={message.tone === 'error' ? 'text-[#ff7a5c]' : 'text-phos'}>
                  {message.tone === 'error' ? '✕ ' : '✓ '}
                  {message.text}
                </span>
              )}
            </div>
          </section>

          {/* Manual */}
          <section aria-labelledby="manual-heading" className="flex flex-col gap-3">
            <h2 id="manual-heading" className="stamp px-1 text-lg font-bold">Defusal manual</h2>
            <div className="crt flex-1 p-5 text-[22px]">
              <p className="mb-3 text-phos-dim">&gt; DEVICE {bomb.glitchId} · {wires.length} WIRES · {manual.length} CUTS</p>
              <ol className="flex flex-col gap-2">
                {manual.map((line, i) => {
                  const done = i < step
                  const current = i === step
                  return (
                    <li
                      key={i}
                      aria-current={current ? 'step' : undefined}
                      className={`flex gap-3 px-2 py-1 leading-tight transition-colors duration-200 ${current ? 'bg-[#1f5a2a] text-phos outline outline-2 outline-[#7dff8a]' : done ? 'text-phos-dim line-through' : 'text-phos-dim'}`}
                    >
                      <span className="shrink-0">{done ? '[✓]' : current ? '[▶]' : '[ ]'}</span>
                      <span>
                        <span className="sr-only">Step {i + 1}{done ? ', done' : current ? ', current' : ''}: </span>
                        {line}
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-4 text-phos-dim">&gt; Wires are counted 1 to {wires.length} from the left.</p>
              <p className="mt-2 text-phos animate-blink" aria-hidden="true">_</p>
            </div>
          </section>
        </div>
      )}
    </article>
  )
}

function Wire({
  color,
  index,
  isCut,
  disabled,
  onCut,
}: {
  color: WireColor
  index: number
  isCut: boolean
  disabled: boolean
  onCut: () => void
}) {
  const fill = WIRE_FILL[color]
  const bar = {
    background: `linear-gradient(90deg, ${fill.lo} 0 18%, ${fill.base} 18% 45%, ${fill.hi} 45% 60%, ${fill.base} 60% 82%, ${fill.lo} 82%)`,
    borderLeft: '3px solid #000',
    borderRight: '3px solid #000',
  }
  return (
    <button
      type="button"
      onClick={onCut}
      disabled={disabled}
      aria-label={isCut ? `Wire ${index + 1}, ${color}, cut` : `Cut wire ${index + 1}, ${color}`}
      className="group relative flex h-56 w-14 cursor-crosshair flex-col items-center disabled:cursor-default focus-visible:outline focus-visible:outline-4 focus-visible:outline-amber"
    >
      {isCut ? (
        <>
          <span className="wire-snap block h-[44%] w-5" style={{ ...bar, transform: 'translateX(-5px) rotate(-6deg)', transformOrigin: 'top' }} />
          <span className="block h-[12%]" aria-hidden="true">
            <span className="font-pixel text-[12px] text-[#ff7a5c]">✂</span>
          </span>
          <span className="wire-snap block h-[44%] w-5" style={{ ...bar, transform: 'translateX(5px) rotate(6deg)', transformOrigin: 'bottom' }} />
        </>
      ) : (
        <span
          className="block h-full w-5 transition-transform duration-150 ease-out group-hover:scale-x-[1.2] group-disabled:group-hover:scale-x-100"
          style={bar}
        />
      )}
    </button>
  )
}

function DefusedScreen({ bomb }: { bomb: BombState }) {
  return (
    <section className="metal rivets p-5" aria-labelledby="defused-heading">
      <div className="crt flex flex-col items-center gap-4 p-8 text-center sm:p-12">
        <span className="flex gap-3" aria-hidden="true">
          <span data-on="green" className="lamp size-6" />
          <span data-on="green" className="lamp size-6" />
          <span data-on="green" className="lamp size-6" />
        </span>
        <h1 id="defused-heading" className="text-[clamp(4rem,11vw,8rem)] leading-[0.85] text-phos crt-in">DEVICE DEFUSED</h1>
        {bomb.defusePoints != null && (
          <p className="readout px-6 py-1 text-5xl" style={{ animation: 'defuse-rise 500ms steps(5) both' }}>
            +{bomb.defusePoints} hero points
          </p>
        )}
        <p className="text-3xl leading-tight text-phos">
          {bomb.defusedByCodename ? `${bomb.defusedByCodename} cut the last wire.` : 'The last wire is cut.'}{' '}
          {bomb.siteName} is safe.
        </p>
        <p className="text-xl text-phos-dim">No one was hurt. The glitch is marked fixed and the save is in the radio log.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link to="/leaderboard" className="btn px-6 py-3 text-sm">See the leaderboard ▸</Link>
          <Link to="/glitches/$glitchId" params={{ glitchId: bomb.glitchId }} className="btn px-6 py-3 text-sm">
            Back to {bomb.glitchId}
          </Link>
        </div>
      </div>
    </section>
  )
}

function DetonatedScreen({ bomb, districtName, flash }: { bomb: BombState; districtName: string; flash: boolean }) {
  return (
    <section className="metal overflow-hidden" aria-labelledby="detonated-heading">
      {flash && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50"
          style={{ animation: 'defuse-flash 1200ms steps(8) forwards' }}
        />
      )}
      <div className="hazard h-4" aria-hidden="true" />
      <div className="flex flex-col items-center gap-4 bg-[#5a0d07] p-8 text-center sm:p-12" style={{ boxShadow: 'inset 0 0 80px #000' }}>
        <span className="flex gap-3" aria-hidden="true">
          {Array.from({ length: MAX_STRIKES }, (_, i) => (
            <span key={i} data-on="red" className="lamp size-6 animate-blink" />
          ))}
        </span>
        <h1 id="detonated-heading" className="text-[clamp(4rem,11vw,8rem)] leading-[0.85] text-[#ffb09c] animate-flicker">DETONATED</h1>
        <p className="text-3xl leading-tight text-[#ffd8cc]">
          The device at {bomb.siteName} went off.
        </p>
        {bomb.casualties != null && (
          <dl className="grid grid-cols-3 gap-3" style={flash ? { animation: 'defuse-rise 500ms steps(5) 900ms both' } : undefined}>
            <Toll label="Dead" value={bomb.casualties} />
            <Toll label="Injured" value={bomb.injured ?? 0} />
            <Toll label="Blast radius" value={`${bomb.blastRadius ?? 0} m`} />
          </dl>
        )}
        <p className="max-w-2xl text-2xl leading-tight text-[#ffb09c]">
          Fear in {districtName} is spiking. Residents are staying indoors and the streets around the site are closed.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link to="/glitches/$glitchId" params={{ glitchId: bomb.glitchId }} className="btn px-6 py-3 text-sm">
            Back to {bomb.glitchId}
          </Link>
          <Link to="/districts/$districtId" params={{ districtId: bomb.district }} className="btn px-6 py-3 text-sm">
            See {districtName} ▸
          </Link>
        </div>
      </div>
    </section>
  )
}

function Toll({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <dt className="stamp text-[12px]">{label}</dt>
      <dd className="readout px-4 text-5xl leading-tight tabular-nums">{value}</dd>
    </div>
  )
}
