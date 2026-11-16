// The Play page's autosave timer (CLAUDE.md, "Sessions and saves": an autosave
// every 60 s). Kept apart from the page, and from EmulatorJS, so the rules can
// be unit-tested with fake timers.

/** How often the Play page autosaves. */
export const AUTOSAVE_MS = 60_000

export interface AutosaveOptions<T> {
  /** True when a save may run right now: the game is running, not paused, and no other save is uploading. */
  canSave: () => boolean
  /** Uploads one autosave. */
  save: () => Promise<T>
  onSaved: (result: T) => void
  /** A failed autosave isn't fatal: the next tick tries again. */
  onError: (reason: unknown) => void
  intervalMs?: number
}

/**
 * Autosaves every `intervalMs` until the returned function is called. A tick
 * is skipped while the previous autosave is still uploading, or while
 * `canSave` says no. Nothing is reported after stop, so a page that went away
 * never gets a late update.
 */
export function startAutosave<T>(options: AutosaveOptions<T>): () => void {
  const { canSave, save, onSaved, onError, intervalMs = AUTOSAVE_MS } = options
  let stopped = false
  let inFlight = false

  const tick = () => {
    if (stopped || inFlight || !canSave()) return
    inFlight = true
    // An async wrapper, so a save that throws before its first await is a rejection too.
    void (async () => save())()
      .then(
        (result) => {
          if (!stopped) onSaved(result)
        },
        (reason: unknown) => {
          if (!stopped) onError(reason)
        },
      )
      .finally(() => {
        inFlight = false
      })
  }

  const timer = setInterval(tick, intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
