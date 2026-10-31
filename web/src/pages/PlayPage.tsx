import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { errorMessage, getGame } from '../lib/api.ts'
import type { Game } from '../lib/types.ts'

export default function PlayPage() {
  const { gameId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const saveId = searchParams.get('saveId')
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getGame(gameId)
      .then((loadedGame) => {
        if (!cancelled) setGame(loadedGame)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  if (error) return <p className="error">{error}</p>
  if (!game) return <p className="muted">Loading…</p>

  return (
    <>
      <h1>{game.title}</h1>
      {saveId && <p className="muted">Resuming from save {saveId}.</p>}
      {/* EmulatorJS mounts here in M2 through src/lib/emulator.ts. */}
      <div id="emulator" className="player" role="region" aria-label="Game screen" />
      <div className="actions">
        <button type="button" className="primary" disabled title="Lands in M2">
          Start
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
        <Link to={`/games/${game.id}`}>Back to game</Link>
      </div>
      <p className="muted">
        The player lands in M2: it starts a session, loads EmulatorJS with the game file, sends a
        heartbeat every 30 s and an autosave every 60 s.
      </p>
    </>
  )
}
