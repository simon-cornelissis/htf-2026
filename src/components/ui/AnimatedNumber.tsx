import { useEffect, useRef, useState } from 'react'

/**
 * A number that rolls to its new value instead of jumping, like a mechanical
 * counter. Renders the real value on the server and on first paint; only a
 * change tweens (a short rAF run that stops itself). Reduced motion: instant.
 */
export function AnimatedNumber({
  value,
  duration = 450,
  pad = 0,
  format,
}: {
  value: number
  duration?: number
  /** Zero-pad to this many digits, e.g. 2 → "07". */
  pad?: number
  format?: (n: number) => string
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    const start = from.current
    if (start === value) return
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || duration <= 0) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      // Ease out, in whole steps: a counter, not a slider.
      const eased = 1 - (1 - k) ** 3
      const n = Math.round(start + (value - start) * eased)
      from.current = n
      setShown(n)
      frame.current = k < 1 ? requestAnimationFrame(tick) : null
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [value, duration])

  const text = format ? format(shown) : pad ? String(shown).padStart(pad, '0') : String(shown)
  return <span className="tabular-nums">{text}</span>
}
