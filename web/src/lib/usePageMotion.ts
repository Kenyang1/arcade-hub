import { useEffect, useLayoutEffect, useRef } from 'react'

/** Animate the shell without remounting route state or the emulator. */
export function usePageMotion(pathname: string) {
  const ref = useRef<HTMLElement>(null)
  const keyboard = useRef(false)

  useEffect(() => {
    const root = document.documentElement
    const onKey = () => { keyboard.current = true; root.dataset.input = 'keyboard' }
    const onPointer = () => { keyboard.current = false; root.dataset.input = 'pointer' }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      delete root.dataset.input
    }
  }, [])

  useLayoutEffect(() => {
    const element = ref.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!element || !element.animate || preference.matches || keyboard.current || pathname.startsWith('/play/')) return
    const animation = element.animate(
      [{ opacity: 0.65 }, { opacity: 1 }],
      { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    const cancel = () => animation.cancel()
    preference.addEventListener('change', cancel)
    document.addEventListener('keydown', cancel, true)
    return () => {
      animation.cancel()
      preference.removeEventListener('change', cancel)
      document.removeEventListener('keydown', cancel, true)
    }
  }, [pathname])

  return ref
}
