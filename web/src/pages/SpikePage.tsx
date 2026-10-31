import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/api.ts'
import * as emulator from '../lib/emulator.ts'

// M0 spike: proves a save state comes out of EmulatorJS and goes back in. The
// game file is picked from the player's own disk, so no game is ever in git.
// Remove this page once the Play page has Export and Load (see the M0 plan).

const STATE_KEY = 'arcade-hub:spike-state'

interface StoredState {
  base64: string
  bytes: number
  savedAt: string
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function readStored(): StoredState | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as StoredState) : null
  } catch {
    return null
  }
}

function describe(stored: StoredState): string {
  const kb = (stored.bytes / 1024).toFixed(1)
  return `Stored state: ${kb} KB, exported at ${new Date(stored.savedAt).toLocaleTimeString()}.`
}

export default function SpikePage() {
  const [running, setRunning] = useState(false)
  const [stored, setStored] = useState<StoredState | null>(readStored)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startCount = useRef(0)

  useEffect(() => () => emulator.stop(), [])

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const attempt = ++startCount.current
    setError(null)
    setStatus(`Starting ${file.name}…`)
    setRunning(false)
    const gameUrl = URL.createObjectURL(file)
    try {
      const container = document.getElementById('spike-player')
      if (!container) throw new Error('The game screen is missing from the page.')
      // gameName keeps the file extension: for a blob URL EmulatorJS 4.2.3 takes
      // the name it writes the game under from gameName, and the core needs the
      // extension to recognise the file.
      await emulator.start({ container, core: 'nes', gameUrl, gameName: file.name })
      if (attempt !== startCount.current) return
      setRunning(true)
      setStatus(`Playing ${file.name}.`)
    } catch (reason) {
      if (attempt !== startCount.current) return
      setStatus(null)
      setError(errorMessage(reason))
    } finally {
      URL.revokeObjectURL(gameUrl)
    }
  }

  function onExport() {
    setError(null)
    try {
      const bytes = emulator.getSaveState()
      const next: StoredState = {
        base64: toBase64(bytes),
        bytes: bytes.length,
        savedAt: new Date().toISOString(),
      }
      try {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(next))
      } catch {
        setError('The browser would not keep the state. Its storage may be full or blocked.')
        return
      }
      setStored(next)
      setStatus(`Exported ${(bytes.length / 1024).toFixed(1)} KB at ${new Date().toLocaleTimeString()}.`)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  function onLoad() {
    setError(null)
    const current = readStored()
    if (!current) {
      setStored(null)
      setError('There is no stored state to load. Export one first.')
      return
    }
    try {
      emulator.loadSaveState(fromBase64(current.base64))
      setStatus(`Loaded the state from ${new Date(current.savedAt).toLocaleTimeString()}.`)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  function onClear() {
    setError(null)
    try {
      sessionStorage.removeItem(STATE_KEY)
    } catch {
      setError('The browser would not let the stored state be removed.')
      return
    }
    setStored(null)
    setStatus('Stored state cleared.')
  }

  return (
    <>
      <h1>Save state spike</h1>
      <ol>
        <li>Pick a NES game file from your computer and play a bit.</li>
        <li>Choose Export state.</li>
        <li>Reload this page, then pick the same game again.</li>
        <li>Choose Load state. The game should resume at the same spot.</li>
      </ol>
      <p className="muted">
        The state is kept in this tab's session storage, and the game file never leaves your
        computer.
      </p>
      <p>
        <label htmlFor="spike-file">NES game file (.nes) </label>
        <input id="spike-file" type="file" accept=".nes" onChange={onPickFile} />
      </p>
      <div id="spike-player" className="player" role="region" aria-label="Game screen" />
      <div className="actions">
        <button type="button" className="primary" disabled={!running} onClick={onExport}>
          Export state
        </button>
        <button type="button" disabled={!running || !stored} onClick={onLoad}>
          Load state
        </button>
        <button type="button" disabled={!stored} onClick={onClear}>
          Clear stored state
        </button>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {error ? '' : (status ?? 'No game running.')}
      </p>
      {stored && <p className="muted">{describe(stored)}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
