import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  ApiError,
  downloadGameFile,
  downloadSaveFile,
  endSession,
  errorMessage,
  gameFileUrl,
  getGame,
  getSession,
  heartbeat,
  startSession,
  updateSession,
  uploadSave,
  uploadSaveOnExit,
} from '../lib/api.ts'
import { startAutosave } from '../lib/autosave.ts'
import * as emulator from '../lib/emulator.ts'
import { readExportedState, writeExportedState, type ExportedState } from '../lib/exportedState.ts'
import { signInLink } from '../lib/nextPath.ts'
import type { Game, Save, SessionStatus, StartSessionResponse } from '../lib/types.ts'

// M2: opening a game starts a session (POST /api/sessions) and the game file
// comes from the session. A heartbeat goes out every 30 s. Save uploads the
// state to the API, and ?saveId= resumes from a save in any tab. M3: an autosave
// uploads every 60 s while the game runs (see lib/autosave.ts and
// docs/plans/2026-11-15-sign-in-my-saves-autosave.md). If the session
// can't start, the game still plays the M1 way, without saving to the server.
// M4 (docs/plans/2026-11-19-managed-play-web.md): Pause and Resume report to
// the API, the session's status shows as a badge, a session that went idle
// offers a new one from the current spot, and one last autosave goes up when
// the player leaves the page or closes the tab.
// Export state and Load state still keep a state in this tab until the Nov 15
// check passes (see docs/plans/2026-11-12-play-page-sessions-and-saves.md).

const PLAYER_ID = 'emulator'
const HEARTBEAT_MS = 30_000

const STATUS_LABELS: Record<SessionStatus, string> = {
  running: 'Running',
  paused: 'Paused',
  idle: 'Idle',
  ended: 'Ended',
}

/** A session takes heartbeats, saves and status changes only while running or paused. */
function isLive(status: SessionStatus | null): status is 'running' | 'paused' {
  return status === 'running' || status === 'paused'
}

/** True when the API said the session is no longer running or paused. */
function isConflict(reason: unknown): boolean {
  return reason instanceof ApiError && reason.status === 409
}

function timeOf(date: Date): string {
  return date.toLocaleTimeString()
}

function sizeOf(bytes: Uint8Array): string {
  return `${(bytes.length / 1024).toFixed(1)} KB`
}

/**
 * Ends a session when the page goes away, after one last autosave when a state
 * is given, so the save lands before the session closes. Nobody is left to
 * tell, so a failure is only logged.
 */
function endQuietly(sessionId: string, lastState?: Uint8Array): void {
  const lastSave = lastState ? uploadSave(sessionId, 'autosave', lastState) : Promise.resolve(null)
  lastSave
    .catch((reason: unknown) => {
      console.warn(`The last autosave for session ${sessionId} did not reach the server:`, reason)
    })
    .then(() => endSession(sessionId))
    .catch((reason: unknown) => {
      console.warn(`Could not end session ${sessionId}:`, reason)
    })
}

/** The state to keep when the page goes away: only from a game that is running, not paused (pausing already saved it). */
function stateToKeep(status: SessionStatus | null): Uint8Array | undefined {
  if (status !== 'running' || !emulator.isRunning() || emulator.isPaused()) return undefined
  try {
    return emulator.getSaveState()
  } catch (reason) {
    console.warn('Could not read the save state on the way out:', reason)
    return undefined
  }
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
  // The session's status as the API last reported it. Null while there is no session.
  const [sessionStatus, setSessionStatusState] = useState<SessionStatus | null>(null)
  // True while a Pause or Resume is reported, so the button can't be pressed twice.
  const [switching, setSwitching] = useState(false)
  // True while a new session is started after the old one went idle.
  const [restarting, setRestarting] = useState(false)
  // When the last autosave landed, or why it didn't. Quiet notes, never page errors.
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null)
  const [autosaveNote, setAutosaveNote] = useState<string | null>(null)
  // True when the API said the player isn't signed in, so the page offers sign-in.
  const [needsSignIn, setNeedsSignIn] = useState(false)
  // True while a manual save uploads, so an autosave doesn't upload the same moment.
  const savingRef = useRef(false)
  // The live session id, for cleanup when the page goes away.
  const sessionIdRef = useRef<string | null>(null)
  // The status, for cleanup and the pagehide handler, which outlive a render.
  const statusRef = useRef<SessionStatus | null>(null)
  const setSessionStatus = (next: SessionStatus | null) => {
    statusRef.current = next
    setSessionStatusState(next)
  }
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
        if (reason instanceof ApiError && reason.status === 401) setNeedsSignIn(true)
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
        setSessionStatus('running')
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
      // Leaving the page inside the app: the page is still alive, so the last
      // autosave can land before the session ends. Read it before stopping.
      const sessionToEnd = sessionIdRef.current
      const lastState = sessionToEnd ? stateToKeep(statusRef.current) : undefined
      // Also halts a start in flight: its promise never settles, so it updates nothing.
      emulator.stop()
      if (sessionToEnd && isLive(statusRef.current)) endQuietly(sessionToEnd, lastState)
      sessionIdRef.current = null
      statusRef.current = null
    }
    // startGame only uses refs and state setters, so it isn't a dependency.
  }, [gameId, saveId])

  const sessionId = session?.sessionId
  const live = isLive(sessionStatus)

  /**
   * After a 409, the session is no longer running or paused (the idle sweep, or
   * End in another tab). Reads its real status and stops the game, so nothing
   * more is played that can't be saved. Returns true when it was a 409.
   */
  async function checkConflict(reason: unknown): Promise<boolean> {
    if (!isConflict(reason) || !sessionIdRef.current) return false
    const id = sessionIdRef.current
    let next: SessionStatus = 'idle'
    try {
      next = (await getSession(id)).status
    } catch (readError) {
      console.warn(`Could not read the status of session ${id}:`, readError)
    }
    if (sessionIdRef.current !== id || isLive(next)) return true
    if (emulator.isRunning() && !emulator.isPaused()) emulator.pause()
    setSessionStatus(next)
    setStatus(
      next === 'idle'
        ? 'This session went idle, so the server stopped taking saves. The game is paused where you left it.'
        : 'This session was ended, so the server stopped taking saves. The game is paused where you left it.',
    )
    return true
  }

  // Heartbeat every 30 s while the session is live. A failed one is shown, not fatal.
  useEffect(() => {
    if (!sessionId || !live) return
    const timer = window.setInterval(() => {
      heartbeat(sessionId).then(
        () => setServerNote(null),
        async (reason: unknown) => {
          if (await checkConflict(reason)) return
          setServerNote(`Lost touch with the server. ${errorMessage(reason)}`)
        },
      )
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
    // checkConflict only uses refs and state setters, so it isn't a dependency.
  }, [sessionId, live])

  // Autosave every 60 s while the game runs. Skipped while paused or while a
  // manual save uploads; a failed one is shown and tried again next minute.
  useEffect(() => {
    if (!sessionId || !live || !running) return
    return startAutosave({
      canSave: () => !savingRef.current && emulator.isRunning() && !emulator.isPaused(),
      save: () => uploadSave(sessionId, 'autosave', emulator.getSaveState()),
      onSaved: (save) => {
        setAutosavedAt(new Date(save.createdAt))
        setAutosaveNote(null)
      },
      onError: async (reason) => {
        if (await checkConflict(reason)) return
        if (reason instanceof ApiError && reason.status === 401) setNeedsSignIn(true)
        setAutosaveNote(`The last autosave didn't reach the server. ${errorMessage(reason)} Trying again in a minute.`)
      },
    })
    // checkConflict only uses refs and state setters, so it isn't a dependency.
  }, [sessionId, live, running])

  // Closing the tab or reloading: no React cleanup runs, so pagehide sends one
  // last autosave with keepalive. The session is left to go idle: a DELETE sent
  // in the same moment could reach the server first and turn the save into a 409.
  useEffect(() => {
    if (!sessionId) return
    const onPageHide = () => {
      const lastState = stateToKeep(statusRef.current)
      if (lastState && sessionIdRef.current === sessionId) uploadSaveOnExit(sessionId, lastState)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [sessionId])

  async function onSave() {
    if (!session || !running) return
    setError(null)
    setSaving(true)
    savingRef.current = true
    try {
      const save = await uploadSave(session.sessionId, 'manual', emulator.getSaveState())
      setLastSave(save)
      setStatus(`Saved to the server at ${timeOf(new Date(save.createdAt))}.`)
    } catch (reason) {
      if (await checkConflict(reason)) return
      if (reason instanceof ApiError && reason.status === 401) setNeedsSignIn(true)
      setError(`The save didn't reach the server. ${errorMessage(reason)}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    emulator.focus()
  }

  /** Pause: pause the game, report it, then autosave the paused spot. Resume: report it, then play. */
  async function onTogglePause() {
    if (!session || !running || !live || switching) return
    const id = session.sessionId
    setError(null)
    setSwitching(true)
    try {
      if (sessionStatus === 'running') {
        emulator.pause()
        try {
          setSessionStatus((await updateSession(id, { status: 'paused' })).status)
        } catch (reason) {
          if (await checkConflict(reason)) return
          // The game stays paused here; only the server's record is behind.
          setSessionStatus('paused')
          setServerNote(`The pause didn't reach the server. ${errorMessage(reason)}`)
        }
        setStatus('Paused.')
        savingRef.current = true
        try {
          const save = await uploadSave(id, 'autosave', emulator.getSaveState())
          setAutosavedAt(new Date(save.createdAt))
          setAutosaveNote(null)
        } catch (reason) {
          if (await checkConflict(reason)) return
          setAutosaveNote(`The paused spot didn't reach the server. ${errorMessage(reason)}`)
        } finally {
          savingRef.current = false
        }
      } else {
        try {
          setSessionStatus((await updateSession(id, { status: 'running' })).status)
        } catch (reason) {
          if (await checkConflict(reason)) return
          setSessionStatus('running')
          setServerNote(`The resume didn't reach the server. ${errorMessage(reason)}`)
        }
        emulator.resume()
        setStatus('Playing again.')
      }
    } finally {
      setSwitching(false)
      emulator.focus()
    }
  }

  /**
   * The old session went idle or ended while the game was still on screen:
   * start a new session and save the current spot to it at once, so nothing is
   * lost and the game carries on from here.
   */
  async function onStartAgain() {
    if (!game || restarting) return
    setError(null)
    setRestarting(true)
    try {
      const started = await startSession({ gameId })
      sessionIdRef.current = started.sessionId
      setSession(started)
      setSessionStatus('running')
      setServerNote(null)
      setAutosaveNote(null)
      if (emulator.isRunning()) {
        if (emulator.isPaused()) emulator.resume()
        const save = await uploadSave(started.sessionId, 'autosave', emulator.getSaveState())
        setAutosavedAt(new Date(save.createdAt))
      }
      setStatus(`New session started. Playing ${game.title} from where you were.`)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setNeedsSignIn(true)
      setError(`A new session couldn't be started. ${errorMessage(reason)}`)
    } finally {
      setRestarting(false)
      emulator.focus()
    }
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
    setSessionStatus('ended')
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
      <div className="play-heading">
        <h1>{game ? game.title : error ? 'Game not available' : 'Loading…'}</h1>
        {sessionStatus && (
          <span className={`badge badge-session badge-${sessionStatus}`} aria-label={`Session ${STATUS_LABELS[sessionStatus]}`}>
            {STATUS_LABELS[sessionStatus]}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        id={PLAYER_ID}
        className="player"
        role="region"
        aria-label="Game screen"
        hidden={!game}
      />
      <div className="actions">
        <button type="button" className="primary" disabled={!running || !session || !live || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={!running} onClick={onExport}>
          Export state
        </button>
        <button type="button" disabled={!running || !exported} onClick={onLoad}>
          Load state
        </button>
        <button
          type="button"
          disabled={!running || !session || !live || switching}
          aria-pressed={sessionStatus === 'paused'}
          onClick={onTogglePause}
        >
          {sessionStatus === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button type="button" disabled={!session || !live} onClick={onEnd}>
          End
        </button>
        <Link to={`/games/${gameId}`}>Back to game</Link>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {error ? '' : (status ?? '')}
      </p>
      {(sessionStatus === 'idle' || sessionStatus === 'ended') && running && (
        <p>
          <button type="button" className="primary" disabled={restarting} onClick={onStartAgain}>
            {restarting ? 'Starting…' : 'Keep playing from here'}
          </button>{' '}
          <span className="muted">Starts a new session and saves this spot to it.</span>
        </p>
      )}
      {lastSave && (
        <p>
          <Link to={`/play/${gameId}?saveId=${encodeURIComponent(lastSave.id)}`} target="_blank" rel="noopener">
            Resume this save in a new tab
          </Link>
        </p>
      )}
      {autosavedAt && !autosaveNote && <p className="muted">Autosaved at {timeOf(autosavedAt)}.</p>}
      {autosaveNote && <p className="muted">{autosaveNote}</p>}
      {serverNote && <p className="muted">{serverNote}</p>}
      {needsSignIn && (
        <p>
          <Link to={signInLink(`/play/${gameId}${saveId ? `?saveId=${encodeURIComponent(saveId)}` : ''}`)}>
            Sign in to keep your saves
          </Link>
        </p>
      )}
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
