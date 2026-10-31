import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { errorMessage, getGame, listSaves } from '../lib/api.ts'
import type { Game, Save } from '../lib/types.ts'

export default function GameDetailsPage() {
  const { gameId = '' } = useParams()
  const [game, setGame] = useState<Game | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getGame(gameId), listSaves(gameId)])
      .then(([loadedGame, loadedSaves]) => {
        if (cancelled) return
        setGame(loadedGame)
        setSaves(loadedSaves)
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
      <p className="muted">
        {game.genre} · {game.core.toUpperCase()} · added {new Date(game.createdAt).toLocaleDateString()}
      </p>
      <p>{game.description}</p>
      <div className="actions">
        <Link to={`/play/${game.id}`} className="button primary">
          Play
        </Link>
      </div>

      <h2>Your saves</h2>
      {saves.length === 0 ? (
        <p className="muted">No saves yet.</p>
      ) : (
        <ul>
          {saves.map((save) => (
            <li key={save.id}>
              {save.kind} · {new Date(save.createdAt).toLocaleString()} ·{' '}
              <Link to={`/play/${game.id}?saveId=${save.id}`}>Resume</Link>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Edit and delete land in M1.</p>
    </>
  )
}
