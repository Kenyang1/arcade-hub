import { useEffect, useRef } from 'react'

type Handler = (event: KeyboardEvent) => void

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Single-key page shortcuts, keyed by `event.key` (letters in lower case).
 * Ignored while the player types in a field or holds Ctrl, Alt or Meta, so
 * shortcuts never fight with text entry or browser keys. The hint bar in
 * Layout.tsx lists them.
 */
export function useShortcuts(handlers: Record<string, Handler>): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      if (isTyping(event.target)) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      latest.current[key]?.(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
