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
  const [progress, setProgress] = useState(0)
  const frame = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef(0)
  const done = useRef(false)

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    if (timer.current) clearTimeout(timer.current)
    frame.current = null
    timer.current = null
    if (!done.current) setProgress(0)
  }

  const begin = () => {
    if (timer.current) return
    done.current = false
    start.current = performance.now()
    // The timer decides; animation frames only paint the fill (they can be throttled).
    timer.current = setTimeout(() => {
      done.current = true
      timer.current = null
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = null
      setProgress(1)
      onConfirm()
    }, holdMs)
    const tick = (t: number) => {
      setProgress(Math.min(1, (t - start.current) / holdMs))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
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
        className="absolute inset-y-0 left-0 bg-lamp/70"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{children}</span>
    </button>
  )
}
