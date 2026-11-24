import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { SiteIcon } from '#/components/CityPlan.tsx'
import { DISTRICTS, SITE_META, SITE_TYPES, siteId, siteName, type DistrictId, type Mood, type SiteType } from '#/lib/districts.ts'
import {
  EFFECT_FADE_HOURS,
  OPERATION_META,
  OPERATION_TYPES,
  SITE_IMPACT,
  type OperationType,
} from '#/lib/operations.ts'
import { cancelOperation, planOperation, type Operation } from '#/lib/operations.functions.ts'
import { countdown, useNow } from '#/lib/useNow.ts'

const TIMINGS: { label: string; minutes: number }[] = [
  { label: 'Now', minutes: 0 },
  { label: '1 min', minutes: 1 },
  { label: '5 min', minutes: 5 },
  { label: '30 min', minutes: 30 },
  { label: '2 hrs', minutes: 120 },
]

/**
 * Commander-only: plan a false flag at a landmark. When it goes off it becomes
 * a normal-looking glitch for defenders, and residents' fear and anxiety spike.
 */
export function OperationsDesk({
  district,
  mood,
  site,
  onSite,
  operations,
}: {
  district: DistrictId
  mood: Mood
  site: SiteType | undefined
  onSite: (site: SiteType) => void
  operations: Operation[]
}) {
  const router = useRouter()
  const now = useNow(1000)
  const [type, setType] = useState<OperationType>('blackout')
  const [delay, setDelay] = useState(5)
  const [cover, setCover] = useState('')
  const [coverEdited, setCoverEdited] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const siteLabel = site ? DISTRICTS[district].sites[site] : null
  const autoCover = siteLabel ? OPERATION_META[type].cover(siteLabel) : ''
  const coverText = coverEdited ? cover : autoCover

  // Once a planned operation's time passes, reload so it fires and shows up.
  const fired = useRef(new Set<string>())
  useEffect(() => {
    for (const op of operations) {
      if (op.status === 'PLANNED' && new Date(op.scheduledFor).getTime() <= now && !fired.current.has(op.operationId)) {
        fired.current.add(op.operationId)
        router.invalidate()
      }
    }
  }, [now, operations, router])

  const factor = site ? SITE_IMPACT[site].factor : 1
  const effect = OPERATION_META[type].effect
  const preview = {
    happiness: Math.round(effect.happiness * factor),
    fear: Math.round(effect.fear * factor),
    anxiety: Math.round(effect.anxiety * factor),
  }

  async function authorize() {
    setMessage(null)
    if (!site) {
      setMessage({ tone: 'error', text: 'Pick a target site first: click a landmark on the city plan.' })
      return
    }
    try {
      const { operationId } = await planOperation({
        data: { siteId: siteId(district, site), type, delayMinutes: delay, coverStory: coverText },
      })
      setCoverEdited(false)
      await router.invalidate()
      setMessage({
        tone: 'ok',
        text: delay === 0 ? `${operationId} executed. Watch the mood meters.` : `${operationId} scheduled. It goes off in ${delay} min.`,
      })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Authorization failed. Try again.' })
    }
  }

  async function cancel(operationId: string) {
    setMessage(null)
    try {
      await cancelOperation({ data: operationId })
      await router.invalidate()
      setMessage({ tone: 'ok', text: `${operationId} cancelled.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t cancel. Try again.' })
    }
  }

  return (
    <section aria-labelledby="ops-heading" className="metal rivets overflow-hidden">
      <div className="hazard h-4" aria-hidden="true" />
      <div className="p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="ops-heading" className="flex items-center gap-2">
            <span className="stamp text-2xl font-bold">Operations desk</span>
            <InfoTip
              label="What is the operations desk?"
              text={`Commanders only. Stage an incident at a landmark and blame it on the Desync. When it goes off, defenders see an ordinary glitch. Residents' fear and anxiety spike, then fade over ${EFFECT_FADE_HOURS} hours.`}
            />
          </h2>
          <span className="flex items-center gap-2">
            <span data-on="red" className="lamp size-3 animate-blink" aria-hidden="true" />
            <span className="stamp text-[10px]">Classified · commanders only</span>
          </span>
        </div>
        <p className="mb-5 leading-tight text-[#d8d3a6]">Plan a false flag operation in {DISTRICTS[district].name}. Steps 1 to 4, then hold to authorize.</p>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-5">
            {/* 1. Target */}
            <fieldset>
              <legend className="stamp mb-2 text-xs">1. Target site</legend>
              <div className="grid grid-cols-5 gap-2">
                {SITE_TYPES.map((t) => (
                  <Tip key={t} text={`${DISTRICTS[district].sites[t]}: ${SITE_META[t].hint} Impact ×${SITE_IMPACT[t].factor}, ${SITE_IMPACT[t].why}.`} className="w-full">
                    <button
                      type="button"
                      aria-pressed={site === t}
                      onClick={() => onSite(t)}
                      className="btn flex w-full flex-col items-center gap-1 px-1 py-2 text-[9px]"
                    >
                      <SiteIcon type={t} size={28} />
                      <span className="w-full truncate text-center">{SITE_META[t].label}</span>
                    </button>
                  </Tip>
                ))}
              </div>
              <p className="mt-2 text-lg leading-tight text-[#d8d3a6]">
                {site ? (
                  <>Target: <span className="text-amber">{siteLabel}</span> · impact ×{factor} ({SITE_IMPACT[site].why})</>
                ) : (
                  'Pick a landmark here or on the city plan.'
                )}
              </p>
            </fieldset>

            {/* 2. Type */}
            <fieldset>
              <legend className="stamp mb-2 text-xs">2. Operation</legend>
              <div className="flex flex-col gap-2">
                {OPERATION_TYPES.map((t) => {
                  const m = OPERATION_META[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={type === t}
                      onClick={() => setType(t)}
                      className="btn grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left"
                    >
                      <span>
                        <span className="block text-xs">{m.name}</span>
                        <span className="block font-mono text-lg leading-tight normal-case text-[#d8d3a6]">{m.summary}</span>
                      </span>
                      <span className="font-mono text-lg leading-tight normal-case text-[#ff8a6a]">FEAR +{m.effect.fear}<br />ANX +{m.effect.anxiety}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-5">
            {/* 3. Timing */}
            <fieldset>
              <legend className="stamp mb-2 flex items-center gap-2 text-xs">
                3. When
                <InfoTip label="About timing" text="Scheduled operations can still be cancelled until they go off. 'Now' fires immediately." />
              </legend>
              <div className="flex flex-wrap gap-2">
                {TIMINGS.map((t) => (
                  <button key={t.label} type="button" aria-pressed={delay === t.minutes} onClick={() => setDelay(t.minutes)} className="btn px-3 py-2 text-[10px]">
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* 4. Cover story */}
            <label className="block">
              <span className="stamp mb-2 flex items-center gap-2 text-xs">
                4. Cover story
                <InfoTip label="About the cover story" text="What defenders will read as the first echo of the glitch. It arrives through the anonymous civilian relay, so nobody can trace it back to you." />
              </span>
              <div className="crt rounded-[10px] p-3">
                <textarea
                  rows={3}
                  maxLength={300}
                  value={coverText}
                  onChange={(e) => { setCover(e.target.value); setCoverEdited(true) }}
                  placeholder="> PICK A TARGET SITE FIRST_"
                  className="relative z-10 w-full resize-y bg-transparent text-xl leading-tight text-phos caret-phos placeholder:text-phos-dim focus:outline-none"
                />
              </div>
            </label>

            {/* Projected impact */}
            <div className="readout px-3 py-2 text-xl leading-tight">
              <div className="text-[#c98a1e]">PROJECTED IMPACT ON RESIDENTS</div>
              <div>
                JOY {mood.happiness} → {Math.max(0, mood.happiness + preview.happiness)} · FEAR {mood.fear} →{' '}
                <span className="text-[#ff6a4e]">{Math.min(100, mood.fear + preview.fear)}</span> · ANX {mood.anxiety} →{' '}
                <span className="text-[#ff6a4e]">{Math.min(100, mood.anxiety + preview.anxiety)}</span>
              </div>
            </div>

            <HoldButton label="Hold to authorize the operation" onConfirm={authorize} holdMs={1200} className="btn flex w-full items-center justify-center gap-3 py-4 text-sm">
              <span data-on="red" className="lamp size-4" aria-hidden="true" /> Hold to authorize
            </HoldButton>
            <div aria-live="polite" className={`min-h-6 font-pixel text-xs uppercase ${message?.tone === 'error' ? 'text-[#ff7a5c]' : 'text-[#9dff86]'}`}>
              {message?.text}
            </div>
          </div>
        </div>

        {/* Log */}
        <h3 className="stamp mt-4 mb-2 text-sm">Operations log · {DISTRICTS[district].name}</h3>
        {operations.length === 0 ? (
          <p className="text-lg text-[#d8d3a6]">No operations here yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {operations.map((op) => (
              <li key={op.operationId} className="inset flex flex-wrap items-center gap-x-4 gap-y-1 bg-metal-lo px-3 py-2">
                <span
                  aria-hidden="true"
                  data-on={op.status === 'PLANNED' ? 'amber' : op.status === 'EXECUTED' ? 'red' : undefined}
                  className={`lamp size-3 ${op.status === 'PLANNED' ? 'animate-blink' : ''}`}
                />
                <span className="font-pixel text-xs text-stamp">{op.operationId}</span>
                <span className="text-xl text-[#e8e4d0]">{OPERATION_META[op.type].name}</span>
                <span className="text-lg text-[#c8c49a]">@ {siteName(op.siteId)}</span>
                <span className="ml-auto flex items-center gap-3">
                  {op.status === 'PLANNED' && (
                    <>
                      <span className="readout px-2 text-xl leading-tight" suppressHydrationWarning>T-{countdown(op.scheduledFor, now)}</span>
                      <button type="button" onClick={() => cancel(op.operationId)} className="btn px-3 py-1 text-[10px]">Cancel</button>
                    </>
                  )}
                  {op.status === 'EXECUTED' && op.glitchId && (
                    <Link to="/glitches/$glitchId" params={{ glitchId: op.glitchId }} className="btn px-3 py-1 text-[10px]">
                      Executed → {op.glitchId}
                    </Link>
                  )}
                  {op.status === 'EXECUTED' && !op.glitchId && <span className="font-pixel text-[10px] text-stamp">Executed · file purged</span>}
                  {op.status === 'CANCELLED' && <span className="font-pixel text-[10px] text-stamp/60">Cancelled</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
