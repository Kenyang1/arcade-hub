import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { downloadGameFile, errorMessage, gameFileUrl, getGame } from '../lib/api.ts'
import * as emulator from '../lib/emulator.ts'
import { readExportedState, writeExportedState, type ExportedState } from '../lib/exportedState.ts'
import type { Game } from '../lib/types.ts'

// M1: the game file comes from GET /api/games/{id}/file and runs in EmulatorJS.
// Export state and Load state keep the state in this tab (see exportedState.ts);
// sessions, heartbeat and autosave land in M2.

const PLAYER_ID = 'emulator'

function timeOf(date: Date): string {
  return date.toLocaleTimeString()
}

function sizeOf(bytes: Uint8Array): string {
  return `${(bytes.length / 1024).toFixed(1)} KB`
}

export default function PlayPage() {
  const { gameId = '' } = useParams()
  // A new game id mounts a fresh player, so no state carries over between games.
  return <Player key={gameId} gameId={gameId} />
}

function Player({ gameId }: { gameId: string }) {
  const [searchParams] = useSearchParams()
  const saveId = searchParams.get('saveId')
  const [game, setGame] = useState<Game | null>(null)
  const [running, setRunning] = useState(false)
  const [exported, setExported] = useState<ExportedState | null>(() => readExportedState(gameId))
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True when the server couldn't send the game, so the page offers a file from disk.
  const [offerFile, setOfferFile] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Bumped by every start, so a start that was overtaken (a second file picked) does nothing.
  const startCount = useRef(0)

  async function startGame(file: Blob, gameName: string, core: Game['core'], label: string) {
    const attempt = ++startCount.current
    const container = containerRef.current
    if (!container) return
    setRunning(false)
    setError(null)
    setStatus(`Starting ${label}…`)
    const gameUrl = URL.createObjectURL(file)
    try {
      // gameName keeps the file extension: for a blob: URL EmulatorJS 4.2.3 names
      // the game file from it, and the core needs the extension (see the M0 plan).
      await emulator.start({ container, core, gameUrl, gameName })
      if (attempt !== startCount.current) return
      setRunning(true)
      setStatus(`Playing ${label}.`)
    } catch (reason) {
      if (attempt !== startCount.current) return
      setStatus(null)
      setError(errorMessage(reason))
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
      setStatus(`Downloading ${loadedGame.title}…`)
      let file: Blob
      try {
        file = await downloadGameFile(gameFileUrl(loadedGame.id))
      } catch (reason) {
        if (cancelled) return
        setStatus(null)
        setError(`The game couldn't be loaded from the server. ${errorMessage(reason)}`)
        setOfferFile(true)
        return
      }
      if (cancelled) return
      const gameName = `${loadedGame.id}.${emulator.fileExtension(loadedGame.core)}`
      await startGame(file, gameName, loadedGame.core, loadedGame.title)
    }

    load().catch((reason: unknown) => {
      if (!cancelled) setError(errorMessage(reason))
    })
    return () => {
      cancelled = true
      // Also halts a start in flight: its promise never settles, so it updates nothing.
      emulator.stop()
    }
    // startGame only uses refs and state setters, so it isn't a dependency.
  }, [gameId])

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
      {saveId && game && (
        <p className="muted">Resuming a save lands in M3. For now the game starts from the beginning.</p>
      )}
      <div
        ref={containerRef}
        id={PLAYER_ID}
        className="player"
        role="region"
        aria-label="Game screen"
        hidden={!game}
      />
      <div className="actions">
        <button type="button" className="primary" disabled={!running} onClick={onExport}>
          Export state
        </button>
        <button type="button" disabled={!running || !exported} onClick={onLoad}>
          Load state
        </button>
        <button type="button" disabled title="Lands in M3">
          Save
        </button>
        <button type="button" disabled title="Lands in M4">
          Pause
        </button>
        <button type="button" disabled title="Lands in M2">
          End
        </button>
        <Link to={`/games/${gameId}`}>Back to game</Link>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {error ? '' : (status ?? '')}
      </p>
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
