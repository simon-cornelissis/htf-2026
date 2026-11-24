import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DistrictMap } from '#/components/DistrictMap.tsx'
import { DISTRICTS, parseSiteId, siteName, type DistrictId } from '#/lib/districts.ts'
import { reportEcho } from '#/lib/glitches.functions.ts'

const MAX = 500
const authed = getRouteApi('/_authed')

export type TransmitTarget = { glitchId?: string; district?: DistrictId; siteId?: string }

/**
 * Report an echo. Without a target glitch it opens a new glitch in the
 * picked district; with one it adds an update to that glitch.
 */
export function TransmitDialog({
  target,
  onClose,
}: {
  target: TransmitTarget | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const glitches = authed.useLoaderData()
  const [text, setText] = useState('')
  const [district, setDistrict] = useState<DistrictId | undefined>()
  const [site, setSite] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (target && !dialog.open) {
      setText('')
      setDistrict(target.district)
      setSite(target.siteId)
      setError(null)
      dialog.showModal()
    } else if (!target && dialog.open) {
      dialog.close()
    }
  }, [target])

  const forGlitch = target?.glitchId

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!forGlitch && !district) {
      setError('Mark the district on the map first.')
      return
    }
    if (text.trim().length < 3) {
      setError('Describe what you saw, at least a few words.')
      return
    }
    setPending(true)
    try {
      const { glitchId } = await reportEcho({ data: { description: text, glitchId: forGlitch, district, siteId: site && parseSiteId(site)?.district === district ? site : undefined } })
      onClose()
      await router.invalidate()
      await router.navigate({ to: '/glitches/$glitchId', params: { glitchId }, search: { fresh: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transmission failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  const remaining = MAX - text.length

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="metal rivets m-auto max-h-[calc(100dvh-2rem)] w-[min(720px,calc(100vw-1.5rem))] overflow-y-auto p-0 text-phos-mid"
      aria-labelledby="transmit-title"
    >
      <div className="hazard h-3" aria-hidden="true" />
      <form onSubmit={onSubmit} className="p-4 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="transmit-title" className="stamp text-2xl font-bold">
            {forGlitch ? `Update ${forGlitch}` : 'Transmit echo'}
          </h2>
          <span className="flex shrink-0 items-center gap-2" aria-hidden="true">
            <span data-on="red" className="lamp size-3 animate-blink" />
            <span className="text-lg leading-none text-ink-dim uppercase">On air</span>
          </span>
        </div>

        {!forGlitch && (
          <fieldset className="mb-4">
            <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="label">1. Where? Tap a district</span>
              <span className="readout px-2 text-xl leading-tight uppercase">{district ? DISTRICTS[district].name : '-- none --'}{site ? ` · ${siteName(site)}` : ''}</span>
            </legend>
            <div className="inset mx-auto max-w-[480px] bg-edge p-1">
              <DistrictMap glitches={glitches} selected={district} onSelect={(id) => { setDistrict(id); setSite(undefined); setError(null) }} compact />
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="label mb-2 block">{forGlitch ? 'What changed?' : '2. What did you witness?'}</span>
          <div className="crt rounded-[10px] p-3">
            <textarea
              autoFocus={Boolean(forGlitch)}
              rows={4}
              maxLength={MAX}
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null) }}
              placeholder="> CLOCK TOWER BELLS RANG TWICE AT 14:02, AND AGAIN AT 14:02_"
              className="relative z-10 w-full resize-y bg-transparent text-[22px] leading-tight text-phos caret-phos placeholder:text-phos-dim focus:outline-none"
            />
          </div>
        </label>

        <div className="mt-2 flex items-start justify-between gap-4">
          <span aria-live="polite" className="text-xl leading-tight text-[#ff8a6a]">{error && `✕ ${error}`}</span>
          <span className={`readout px-2 text-xl leading-tight ${remaining < 50 ? 'text-[#ff5a3a]' : ''}`}>{String(remaining).padStart(3, '0')}</span>
        </div>

        <p className="mt-3 text-xl leading-tight text-ink-dim">
          {forGlitch
            ? 'Your echo is added to this glitch’s log.'
            : 'A new echo is logged as a glitch and flagged as leaked until a commander assesses it.'}
        </p>

        <div className="mt-5 flex justify-end gap-4">
          <button type="button" onClick={onClose} className="btn px-5 py-3 text-sm">Cancel</button>
          <button type="submit" disabled={pending} className="btn btn-primary flex items-center gap-3 px-6 py-3 text-sm">
            <span data-on="red" className="lamp size-4" aria-hidden="true" />
            {pending ? 'Sending…' : 'Transmit'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
