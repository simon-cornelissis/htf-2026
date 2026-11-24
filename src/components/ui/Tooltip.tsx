import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover/focus tooltip rendered in a portal with fixed positioning, so it
 * escapes CRT screens and panels that clip their content.
 */
export function Tip({
  text,
  children,
  className = '',
}: {
  text: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return
    const a = anchor.current.getBoundingClientRect()
    const b = bubble.current.getBoundingClientRect()
    const margin = 8
    let top = a.top - b.height - margin
    if (top < margin) top = a.bottom + margin
    let left = a.left + a.width / 2 - b.width / 2
    left = Math.max(margin, Math.min(window.innerWidth - b.width - margin, left))
    setPos({ top, left })
  }, [open])

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[200] max-w-[min(20rem,calc(100vw-16px))] border-2 border-amber bg-[#0b0703] px-3 py-2 text-xl leading-tight text-[#ffd27a] shadow-[4px_4px_0_rgb(0_0_0/0.6)]"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  )
}

/** A small "?" button that explains the thing next to it. */
export function InfoTip({ text, label = 'More info' }: { text: ReactNode; label?: string }) {
  return (
    <Tip text={text}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-full border-2 border-stamp/60 font-mono text-lg leading-none text-stamp hover:border-amber hover:text-amber"
      >
        ?
      </button>
    </Tip>
  )
}
