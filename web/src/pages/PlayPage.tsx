import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  downloadGameFile,
  downloadSaveFile,
  endSession,
  errorMessage,
  gameFileUrl,
  getGame,
  heartbeat,
  startSession,
  uploadSave,
} from '../lib/api.ts'
import * as emulator from '../lib/emulator.ts'
import { readExportedState, writeExportedState, type ExportedState } from '../lib/exportedState.ts'
import type { Game, Save, StartSessionResponse } from '../lib/types.ts'

// M2: opening a game starts a session (POST /api/sessions) and the game file
// comes from the session. A heartbeat goes out every 30 s. Save uploads the
// state to the API, and ?saveId= resumes from a save in any tab. If the session
// can't start, the game still plays the M1 way, without saving to the server.
// Export state and Load state still keep a state in this tab until the Nov 15
// check passes (see docs/plans/2026-11-12-play-page-sessions-and-saves.md).

const PLAYER_ID = 'emulator'
const HEARTBEAT_MS = 30_000

function timeOf(date: Date): string {
  return date.toLocaleTimeString()
}

function sizeOf(bytes: Uint8Array): string {
  return `${(bytes.length / 1024).toFixed(1)} KB`
}

/** Ends a session when the page goes away. Nobody is left to tell, so a failure is only logged. */
function endQuietly(sessionId: string): void {
  endSession(sessionId).catch((reason: unknown) => {
    console.warn(`Could not end session ${sessionId}:`, reason)
  })
}

export default function PlayPage() {
  const { gameId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const saveId = searchParams.get('saveId')
  // A new game or save mounts a fresh player, so no state or session carries over.
  return <Player key={`${gameId}:${saveId ?? ''}`} gameId={gameId} saveId={saveId} />
}

function Player({ gameId, saveId }: { gameId: string; saveId: string | null }) {
  const [game, setGame] = useState<Game | null>(null)
  const [running, setRunning] = useState(false)
  const [exported, setExported] = useState<ExportedState | null>(() => readExportedState(gameId))
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True when the server couldn't send the game, so the page offers a file from disk.
  const [offerFile, setOfferFile] = useState(false)
  const [session, setSession] = useState<StartSessionResponse | null>(null)
  // Why saving to the server is off, or a problem talking to it. Shown, never fatal.
  const [serverNote, setServerNote] = useState<string | null>(null)
  const [lastSave, setLastSave] = useState<Save | null>(null)
  const [saving, setSaving] = useState(false)
  const [ended, setEnded] = useState(false)
  // The live session id, for cleanup when the page goes away.
  const sessionIdRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Bumped by every start, so a start that was overtaken (a second file picked) does nothing.
  const startCount = useRef(0)

  /** Starts the game. Resolves true once it runs, false if it didn't or was overtaken. */
  async function startGame(file: Blob, gameName: string, core: Game['core'], label: string): Promise<boolean> {
    const attempt = ++startCount.current
    const container = containerRef.current
    if (!container) return false
    setRunning(false)
    setError(null)
    setStatus(`Starting ${label}…`)
    const isGame = await emulator.isGameFile(file, core)
    if (attempt !== startCount.current) return false
    if (!isGame) {
      emulator.stop()
      setStatus(null)
      setError(`${label} isn't a ${core.toUpperCase()} game file, so it can't be played.`)
      setOfferFile(true)
      return false
    }
    const gameUrl = URL.createObjectURL(file)
    try {
      // gameName keeps the file extension: for a blob: URL EmulatorJS 4.2.3 names
      // the game file from it, and the core needs the extension (see the M0 plan).
      await emulator.start({ container, core, gameUrl, gameName })
      if (attempt !== startCount.current) return false
      setRunning(true)
      setStatus(`Playing ${label}.`)
      return true
    } catch (reason) {
      if (attempt !== startCount.current) return false
      setStatus(null)
      setError(errorMessage(reason))
      return false
    } finally {
      URL.revokeObjectURL(gameUrl)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const loadedGame = await getGame(gameId)
      if (cancelled) return
      setGame(loadedGame)
      if (!emulator.isCoreSupported(loadedGame.core)) {
        setError(`${loadedGame.core.toUpperCase()} games can't be played here yet. Only NES games run for now.`)
        return
      }
      setStatus('Starting a session…')
      let started: StartSessionResponse | null = null
      try {
        started = await startSession(saveId ? { gameId, saveId } : { gameId })
      } catch (reason) {
        if (cancelled) return
        setServerNote(
          saveId
            ? `The save couldn't be resumed, so the game starts from the beginning. ${errorMessage(reason)}`
            : `Saving to the server is off for this game. ${errorMessage(reason)}`,
        )
      }
      if (cancelled) {
        if (started) endQuietly(started.sessionId)
        return
      }
      if (started) {
        sessionIdRef.current = started.sessionId
        setSession(started)
      }

      let saveState: Uint8Array | null = null
      if (started?.saveFileUrl) {
        setStatus('Downloading your save…')
        try {
          saveState = await downloadSaveFile(started.saveFileUrl)
        } catch (reason) {
          if (cancelled) return
          setServerNote(`The save couldn't be downloaded, so the game starts from the beginning. ${errorMessage(reason)}`)
        }
        if (cancelled) return
      }

      setStatus(`Downloading ${loadedGame.title}…`)
      let file: Blob
      try {
        file = await downloadGameFile(started?.gameFileUrl ?? gameFileUrl(loadedGame.id))
      } catch (reason) {
        if (cancelled) return
        setStatus(null)
        setError(`The game couldn't be loaded from the server. ${errorMessage(reason)}`)
        setOfferFile(true)
        return
      }
      if (cancelled) return
      const gameName = `${loadedGame.id}.${emulator.fileExtension(loadedGame.core)}`
      const playing = await startGame(file, gameName, loadedGame.core, loadedGame.title)
      if (!playing || cancelled || !saveState) return
      try {
        // A load sent while paused did not stick in the M0 spike, so resume first.
        if (emulator.isPaused()) emulator.resume()
        emulator.loadSaveState(saveState)
        setStatus(`Resumed your save in ${loadedGame.title}.`)
      } catch (reason) {
        setError(`The game started, but the save couldn't be loaded. ${errorMessage(reason)}`)
      }
      emulator.focus()
    }

    load().catch((reason: unknown) => {
      if (!cancelled) setError(errorMessage(reason))
    })
    return () => {
      cancelled = true
      // Also halts a start in flight: its promise never settles, so it updates nothing.
      emulator.stop()
      if (sessionIdRef.current) endQuietly(sessionIdRef.current)
      sessionIdRef.current = null
    }
    // startGame only uses refs and state setters, so it isn't a dependency.
  }, [gameId, saveId])

  // Heartbeat every 30 s while the session is live. A failed one is shown, not fatal.
  const sessionId = session?.sessionId
  useEffect(() => {
    if (!sessionId || ended) return
    const timer = window.setInterval(() => {
      heartbeat(sessionId).then(
        () => setServerNote(null),
        (reason: unknown) => setServerNote(`Lost touch with the server. ${errorMessage(reason)}`),
      )
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [sessionId, ended])

  async function onSave() {
    if (!session || !running) return
    setError(null)
    setSaving(true)
    try {
      const save = await uploadSave(session.sessionId, 'manual', emulator.getSaveState())
      setLastSave(save)
      setStatus(`Saved to the server at ${timeOf(new Date(save.createdAt))}.`)
    } catch (reason) {
      setError(`The save didn't reach the server. ${errorMessage(reason)}`)
    } finally {
      setSaving(false)
    }
    emulator.focus()
  }

  async function onEnd() {
    if (!session) return
    setError(null)
    try {
      await endSession(session.sessionId)
    } catch (reason) {
      setError(`The session couldn't be ended. ${errorMessage(reason)}`)
      return
    }
    sessionIdRef.current = null
    emulator.stop()
    setRunning(false)
    setEnded(true)
    setStatus('Session ended. Your saves stay on the server.')
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input, so picking the same file again starts it again.
    event.target.value = ''
    if (!file || !game) return
    void startGame(file, file.name, game.core, file.name)
  }

  function onExport() {
    if (!game) return
    setError(null)
    try {
      const next = writeExportedState(game.id, emulator.getSaveState())
      setExported(next)
      setStatus(`Exported ${sizeOf(next.bytes)} at ${timeOf(next.exportedAt)}.`)
    } catch (reason) {
      setError(errorMessage(reason))
    }
    emulator.focus()
  }

  function onLoad() {
    if (!game) return
    setError(null)
    const current = readExportedState(game.id)
    setExported(current)
    if (!current) {
      setError('There is no exported state to load. Export one first.')
      return
    }
    try {
      // A load sent while paused did not stick in the M0 spike, so resume first.
      if (emulator.isPaused()) emulator.resume()
      emulator.loadSaveState(current.bytes)
      setStatus(`Loaded the state from ${timeOf(current.exportedAt)}.`)
    } catch (reason) {
      setError(errorMessage(reason))
    }
    emulator.focus()
  }

  // The game screen is always in the page, hidden until the game's details load,
  // so it exists by the time EmulatorJS needs it.
  return (
    <>
      <h1>{game ? game.title : error ? 'Game not available' : 'Loading…'}</h1>
      <div
        ref={containerRef}
        id={PLAYER_ID}
        className="player"
        role="region"
        aria-label="Game screen"
        hidden={!game}
      />
      <div className="actions">
        <button type="button" className="primary" disabled={!running || !session || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={!running} onClick={onExport}>
          Export state
        </button>
        <button type="button" disabled={!running || !exported} onClick={onLoad}>
          Load state
        </button>
        <button type="button" disabled title="Lands in M4">
          Pause
        </button>
        <button type="button" disabled={!session || ended} onClick={onEnd}>
          End
        </button>
        <Link to={`/games/${gameId}`}>Back to game</Link>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {error ? '' : (status ?? '')}
      </p>
      {lastSave && (
        <p>
          <Link to={`/play/${gameId}?saveId=${encodeURIComponent(lastSave.id)}`} target="_blank" rel="noopener">
            Resume this save in a new tab
          </Link>
        </p>
      )}
      {serverNote && <p className="muted">{serverNote}</p>}
      {exported && (
        <p className="muted">
          Exported state: {sizeOf(exported.bytes)} from {timeOf(exported.exportedAt)}, kept in this tab
          until it closes.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {offerFile && (
        <p>
          <label htmlFor="game-file">Or play a game file from your computer (.nes) </label>
          <input id="game-file" type="file" accept=".nes" onChange={onPickFile} />
        </p>
      )}
    </>
  )
}
