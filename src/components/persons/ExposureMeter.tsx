import { useEffect, useState } from 'react'
import { InfoTip } from '#/components/ui/Tooltip.tsx'
import { getExposure, type ExposureView } from '#/lib/persons.functions.ts'

const POLL_MS = 30_000
const TONE: Record<'green' | 'amber' | 'red', string> = { green: '#6dff55', amber: '#ffb22e', red: '#ff3a22' }

/**
 * Header meter. Commanders see how close the Desync is to exposing the
 * cover-up, labelled "Cover-up integrity" (100 = intact). Everyone else sees
 * an innocuous public trust figure. Fetches and polls on its own.
 */
export function ExposureMeter({ className = '' }: { className?: string }) {
  const [view, setView] = useState<ExposureView | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const v = await getExposure()
        if (alive) setView(v)
      } catch {
        // Signed out or offline: just keep the last reading.
      }
    }
    load()
    const id = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!view) return null

  if (view.clearance === 'public') {
    return (
      <div className={`flex items-center gap-3 ${className}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.trust} aria-label="Public trust">
        <span className="flex items-center gap-2">
          <span className="label">Public trust</span>
          <InfoTip label="What is public trust?" text="How much Achrona’s residents trust the Guardians, from the agency’s weekly survey. Desync propaganda wears it down." />
        </span>
        <span className="readout px-2 py-0.5 text-3xl leading-none tabular-nums">
          {String(view.trust).padStart(3, '0')}
          <span className="text-xl">%</span>
        </span>
      </div>
    )
  }

  const integrity = 100 - view.exposure
  const segments = 10
  const lit = Math.round((integrity / 100) * segments)
  const color = TONE[view.tone]
  return (
    <div className={`flex items-center gap-3 ${className}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={integrity} aria-label="Cover-up integrity">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="label text-amber">Cover-up integrity</span>
            <InfoTip
              label="What is cover-up integrity?"
              text={
                <>
                  <span className="block text-[#ff8a6a]">CLASSIFIED · COMMANDERS ONLY</span>
                  How well the Meridian secret holds. The Desync wears it down over time, while their journalists are free,
                  and every time we pin an attack on someone still at large (they publish denials). Detaining or erasing
                  them restores it. Each time it drops past a quarter, something leaks.
                </>
              }
            />
          </span>
          <span className="label" style={{ color }}>{view.tier}</span>
        </div>
        <div className="inset mt-1.5 flex gap-[2px] bg-[#0b0703] p-1.5" aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className="h-4 w-2" style={{ background: i < lit ? color : '#1c1a12', boxShadow: i < lit ? `0 0 6px ${color}` : undefined }} />
          ))}
        </div>
      </div>
      <span className={`readout px-2 py-0.5 text-3xl leading-none tabular-nums ${view.tone === 'red' ? 'text-[#ff5a3a] animate-flicker' : ''}`}>
        {String(integrity).padStart(3, '0')}
        <span className="text-xl">%</span>
      </span>
    </div>
  )
}
