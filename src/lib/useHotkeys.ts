import { useEffect, useRef } from 'react'

type Handlers = Record<string, (e: KeyboardEvent) => void>

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

/** Single-key shortcuts that stay out of the way while typing or in a dialog. */
export function useHotkeys(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      if (document.querySelector('dialog[open]')) return
      const handler = ref.current[e.key]
      if (handler) {
        e.preventDefault()
        handler(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
