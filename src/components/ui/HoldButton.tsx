import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Press and hold to confirm a destructive action. Replaces "are you sure?"
 * dialogs: a slip of the finger can't trigger it, but it's still one gesture.
 * Works with mouse, touch and keyboard (hold Space/Enter).
 */
export function HoldButton({
  onConfirm,
  children,
  holdMs = 900,
  className = '',
  label,
}: {
  onConfirm: () => void
  children: ReactNode
  holdMs?: number
  className?: string
  /** Accessible name, e.g. "Hold to delete GL-0142". */
  label: string
}) {
  // The timer decides; the fill is a CSS transition running for exactly holdMs.
  const [phase, setPhase] = useState<'idle' | 'holding' | 'done'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = useRef(false)

  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!done.current) setPhase('idle')
  }

  const begin = () => {
    if (timer.current) return
    done.current = false
    setPhase('holding')
    timer.current = setTimeout(() => {
      done.current = true
      timer.current = null
      setPhase('done')
      onConfirm()
      // Empty the fill again so the button can be used for the next one.
      setTimeout(() => {
        done.current = false
        setPhase('idle')
      }, 400)
    }, holdMs)
  }

  useEffect(() => stop, [])

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          begin()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop()
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden select-none touch-none ${className}`}
    >
      <span
        aria-hidden="true"
        data-phase={phase}
        className="hold-fill absolute inset-0 bg-lamp/70"
        style={{ ['--hold-ms' as string]: `${holdMs}ms` }}
      />
      <span className="relative">{children}</span>
    </button>
  )
}
