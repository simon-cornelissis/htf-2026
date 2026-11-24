import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SiteIcon } from '#/components/CityPlan.tsx'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { FUSE_SECONDS } from '#/lib/bomb.ts'
import { DISTRICTS, SITE_META, SITE_TYPES, siteId, type DistrictId, type Mood, type SiteType } from '#/lib/districts.ts'
import {
  BOMB_OUTCOME_EFFECT,
  EFFECT_FADE_HOURS,
  estimateImpact,
  harmEffect,
  OPERATION_META,
  OPERATION_TYPES,
  SITE_IMPACT,
  type OperationType,
} from '#/lib/operations.ts'
import { planOperation } from '#/lib/operations.functions.ts'

export const TIMINGS: { label: string; minutes: number; hint: string }[] = [
  { label: 'Now', minutes: 0, hint: 'Goes off the moment you authorize.' },
  { label: '1 min', minutes: 1, hint: 'Just enough time to walk away.' },
  { label: '5 min', minutes: 5, hint: 'A short window to cancel.' },
  { label: '30 min', minutes: 30, hint: 'Plenty of time to change your mind.' },
  { label: '2 hrs', minutes: 120, hint: 'Long fuse. Cancel any time before.' },
]

const STEPS = ['Target', 'Type', 'Timing', 'Review'] as const

/** Opening the wizard: from the district header (no target yet) or from a landmark. */
export type PlanRequest = { site?: SiteType }

/**
 * Commander-only: plan a false flag in four short steps. Opens as a modal so
 * the district page stays calm; one decision per screen.
 */
export function PlanOperationWizard({
  district,
  mood,
  request,
  onClose,
}: {
  district: DistrictId
  mood: Mood
  /** null = closed. */
  request: PlanRequest | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [site, setSite] = useState<SiteType | undefined>()
  const [type, setType] = useState<OperationType | undefined>()
  const [delay, setDelay] = useState(5)
  const [cover, setCover] = useState('')
  const [coverEdited, setCoverEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<{ operationId: string; delay: number; type: OperationType } | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (request && !dialog.open) {
      setSite(request.site)
      setStep(request.site ? 1 : 0)
      setType(undefined)
      setDelay(5)
      setCover('')
      setCoverEdited(false)
      setError(null)
      setPending(false)
      setDone(null)
      dialog.showModal()
    } else if (!request && dialog.open) {
      dialog.close()
    }
  }, [request])

  const d = DISTRICTS[district]
  const siteLabel = site ? d.sites[site] : null
  const autoCover = siteLabel && type ? OPERATION_META[type].cover(siteLabel) : ''
  const coverText = coverEdited ? cover : autoCover
  const factor = site ? SITE_IMPACT[site].factor : 1
  const timing = TIMINGS.find((t) => t.minutes === delay) ?? TIMINGS[2]

  const canNext = step === 0 ? Boolean(site) : step === 1 ? Boolean(type) : true
  const next = () => canNext && setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  async function authorize() {
    if (!site || !type || pending) return
    setError(null)
    setPending(true)
    try {
      const { operationId } = await planOperation({
        data: { siteId: siteId(district, site), type, delayMinutes: delay, coverStory: coverText },
      })
      await router.invalidate()
      setDone({ operationId, delay, type })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="metal rivets m-auto max-h-[calc(100dvh-2rem)] w-[min(760px,calc(100vw-1.5rem))] overflow-y-auto p-0 text-ink"
      aria-labelledby="plan-title"
    >
      <div className="hazard h-3" aria-hidden="true" />
      <div className="flex flex-col gap-5 p-4 sm:p-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="plan-title" className="stamp text-xl font-bold sm:text-2xl">Plan operation</h2>
            <p className="text-xl leading-tight text-ink-dim">
              {d.name} · commanders only. Defenders will see an ordinary glitch.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn shrink-0 px-3 py-2 text-sm" aria-label="Close the planner">✕</button>
        </div>

        {done ? (
          <Success done={done} siteLabel={siteLabel ?? ''} onClose={onClose} />
        ) : (
          <>
            <StepIndicator step={step} onJump={(i) => i < step && setStep(i)} />

            <div className="min-h-[18rem]">
              {step === 0 && (
                <Step title="Pick the target landmark" hint="Crowded or vulnerable places amplify the effect on residents.">
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {SITE_TYPES.map((t) => (
                      <li key={t}>
                        <button
                          type="button"
                          aria-pressed={site === t}
                          onClick={() => setSite(t)}
                          onDoubleClick={() => { setSite(t); setStep(1) }}
                          className="btn flex w-full items-center gap-3 px-3 py-2.5 text-left normal-case"
                        >
                          <SiteIcon type={t} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm uppercase">{d.sites[t]}</span>
                            <span className="block font-mono text-lg leading-tight text-ink-dim">
                              {SITE_META[t].label} · impact ×{SITE_IMPACT[t].factor}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {site && (
                    <p className="mt-3 text-xl leading-tight text-ink-dim">
                      <span className="text-amber">{siteLabel}</span>: ×{factor}, {SITE_IMPACT[site].why}.
                    </p>
                  )}
                </Step>
              )}

              {step === 1 && (
                <Step title="Choose the operation" hint={`Effects shown at ${siteLabel} (×${factor}). They fade over ${EFFECT_FADE_HOURS} hours.`}>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {OPERATION_TYPES.map((t) => {
                      const m = OPERATION_META[t]
                      const isBomb = t === 'bomb'
                      return (
                        <li key={t} className={isBomb ? 'sm:col-span-2' : undefined}>
                          <button
                            type="button"
                            aria-pressed={type === t}
                            onClick={() => setType(t)}
                            onDoubleClick={() => { setType(t); setStep(2) }}
                            className="btn flex h-full w-full flex-col items-start gap-1 px-3 py-2.5 text-left normal-case"
                          >
                            <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3">
                              <span className="text-sm uppercase">{m.name}</span>
                              <span className="font-mono text-lg text-[#ffb09a]">
                                FEAR +{Math.round(m.effect.fear * factor)} · ANX +{Math.round(m.effect.anxiety * factor)}
                              </span>
                            </span>
                            <span className="font-mono text-lg leading-tight text-ink-dim">{m.summary}</span>
                            {site && <HarmEstimate type={t} siteIdValue={siteId(district, site)} />}
                            {isBomb && (
                              <span className="mt-1 block border-l-4 border-amber pl-2 font-mono text-lg leading-tight text-amber">
                                When it goes off it arms a {Math.round(FUSE_SECONDS / 60)}-minute fuse and every guardian gets an alert.
                                Any guardian can defuse it for hero points. If nobody does, it detonates: a huge fear spike
                                (FEAR +{Math.round(BOMB_OUTCOME_EFFECT.DETONATED.fear * factor)}).
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Step>
              )}

              {step === 2 && (
                <Step title="When should it go off?" hint="Scheduled operations can be cancelled from the operations log until they go off.">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Timing">
                    {TIMINGS.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        aria-pressed={delay === t.minutes}
                        onClick={() => setDelay(t.minutes)}
                        className="btn px-2 py-3 text-sm"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xl leading-tight text-ink-dim">{timing.hint}</p>
                </Step>
              )}

              {step === 3 && site && type && (
                <Step title="Review and authorize">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xl leading-tight">
                    <dt className="label pt-1">Target</dt>
                    <dd className="text-ink">{siteLabel} <span className="text-ink-dim">({SITE_META[site].label})</span></dd>
                    <dt className="label pt-1">Operation</dt>
                    <dd className="text-ink">{OPERATION_META[type].name}</dd>
                    <dt className="label pt-1">Timing</dt>
                    <dd className="text-ink">{delay === 0 ? 'Immediately' : `In ${timing.label}`}</dd>
                  </dl>

                  <label className="mt-4 block">
                    <span className="label mb-2 block">Cover story · what defenders will read</span>
                    <div className="crt rounded-[10px] p-3">
                      <textarea
                        rows={3}
                        maxLength={300}
                        value={coverText}
                        onChange={(e) => { setCover(e.target.value); setCoverEdited(true) }}
                        className="relative z-10 w-full resize-y bg-transparent text-xl leading-tight text-phos caret-phos focus:outline-none"
                      />
                    </div>
                  </label>

                  <Impact mood={mood} type={type} factor={factor} siteIdValue={siteId(district, site)} />
                </Step>
              )}
            </div>

            <div aria-live="polite" className="min-h-7 text-xl leading-tight text-[#ff8a6a]">
              {error && `✕ ${error}`}
            </div>

            {/* Footer: Back on the left, the one forward action on the right. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {step > 0 ? (
                <button type="button" onClick={back} className="btn px-4 py-3 text-sm">◀ Back</button>
              ) : (
                <button type="button" onClick={onClose} className="btn px-4 py-3 text-sm">Cancel</button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={next} disabled={!canNext} className="btn btn-primary px-5 py-3 text-sm">
                  Next: {STEPS[step + 1]} ▶
                </button>
              ) : (
                <HoldButton
                  label="Hold to authorize the operation"
                  onConfirm={authorize}
                  holdMs={1200}
                  className="btn btn-primary flex items-center justify-center gap-3 px-5 py-3 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <span data-on="red" className="lamp size-3.5" aria-hidden="true" />
                    {pending ? 'Authorizing…' : 'Hold to authorize'}
                  </span>
                </HoldButton>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

function StepIndicator({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo'
        return (
          <li key={label}>
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={state !== 'done'}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex w-full flex-col items-start gap-1 border-t-4 pt-1.5 text-left disabled:cursor-default ${
                state === 'current' ? 'border-amber' : state === 'done' ? 'border-phos-mid hover:border-phos' : 'border-metal-lo'
              }`}
            >
              <span className={`font-mono text-lg leading-none ${state === 'todo' ? 'text-ink-dim/70' : 'text-ink'}`}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={`label block w-full truncate text-xs sm:text-sm ${state === 'todo' ? 'opacity-60' : ''}`}>{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="crt-in">
      <h3 className="stamp text-lg font-bold">{title}</h3>
      {hint && <p className="mb-3 text-xl leading-tight text-ink-dim">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

/** Expected body count and reach at the chosen site. */
function HarmEstimate({ type, siteIdValue }: { type: OperationType; siteIdValue: string }) {
  const e = estimateImpact(type, siteIdValue)
  const range = ([lo, hi]: [number, number]) => (lo === hi ? `${lo}` : `${lo}–${hi}`)
  const parts = [
    ...(e.dead[1] > 0 ? [`${range(e.dead)} ${e.countWord}`] : []),
    ...(e.injured[1] > 0 ? [`${range(e.injured)} hurt`] : []),
    `${range(e.radius)} m`,
  ]
  return (
    <span className="font-mono text-lg leading-tight text-[#ffb09a]">
      {type === 'bomb' ? 'If it detonates: ' : 'Expected: '}
      {parts.join(' · ')}
    </span>
  )
}

function Impact({ mood, type, factor, siteIdValue }: { mood: Mood; type: OperationType; factor: number; siteIdValue: string }) {
  // The operation itself, plus the fear from a typical body count. Bombs count only if they go off.
  const est = estimateImpact(type, siteIdValue)
  const harm = type === 'bomb' ? { happiness: 0, fear: 0, anxiety: 0 } : harmEffect((est.dead[0] + est.dead[1]) / 2, (est.injured[0] + est.injured[1]) / 2)
  const base = OPERATION_META[type].effect
  // The body count already includes the site, so undo the ×factor applied below.
  const e = { happiness: base.happiness + harm.happiness / factor, fear: base.fear + harm.fear / factor, anxiety: base.anxiety + harm.anxiety / factor }
  const rows: { label: string; from: number; delta: number; bad: boolean }[] = [
    { label: 'Fear', from: mood.fear, delta: Math.round(e.fear * factor), bad: true },
    { label: 'Anxiety', from: mood.anxiety, delta: Math.round(e.anxiety * factor), bad: true },
    { label: 'Joy', from: mood.happiness, delta: Math.round(e.happiness * factor), bad: false },
  ]
  return (
    <div className="readout mt-4 px-3 py-2 text-xl leading-tight">
      <div className="text-[#d89a2e]">PROJECTED IMPACT ON RESIDENTS</div>
      <ul className="flex flex-wrap gap-x-6">
        {rows.map((r) => {
          const to = Math.max(0, Math.min(100, r.from + r.delta))
          return (
            <li key={r.label}>
              {r.label.toUpperCase()} {r.from} → <span className={r.bad ? 'text-[#ff6a4e]' : 'text-[#ffd27a]'}>{to}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Success({
  done,
  siteLabel,
  onClose,
}: {
  done: { operationId: string; delay: number; type: OperationType }
  siteLabel: string
  onClose: () => void
}) {
  const now = done.delay === 0
  return (
    <div className="crt-in flex flex-col gap-4" role="status">
      <div className="crt rounded-[10px] p-5 text-2xl leading-tight">
        <p className="text-phos">&gt; {done.operationId} AUTHORIZED.</p>
        <p className="text-phos-dim">
          {OPERATION_META[done.type].name} at {siteLabel}.{' '}
          {now ? 'It has gone off. Watch the mood meters.' : `It goes off in ${TIMINGS.find((t) => t.minutes === done.delay)?.label ?? `${done.delay} min`}. You can cancel it from the operations log.`}
        </p>
        {done.type === 'bomb' && now && (
          <p className="mt-2 text-amber">The fuse is burning. Every guardian has been alerted.</p>
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="btn btn-primary px-6 py-3 text-sm">Done</button>
      </div>
    </div>
  )
}
