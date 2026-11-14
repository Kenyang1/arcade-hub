import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Backdrop from '../components/Backdrop.tsx'
import GameCover from '../components/GameCover.tsx'
import { errorMessage, getGame, listSaves } from '../lib/api.ts'
import { savedAt } from '../lib/time.ts'
import type { Game, Save } from '../lib/types.ts'
import { useShortcuts } from '../lib/useShortcuts.ts'

export default function GameDetailsPage() {
  const { gameId = '' } = useParams()
  const navigate = useNavigate()
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

  useShortcuts({
    p: () => {
      if (game) navigate(`/play/${game.id}`)
    },
    Escape: () => navigate('/'),
  })

  if (error) {
    return (
      <div className="panel">
        <h1>Game not available</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/" className="button">
          Back to the library
        </Link>
      </div>
    )
  }
  if (!game) return <p className="muted">Loading…</p>

  return (
    <>
      <Backdrop game={game} />
      <Link to="/" className="back-link">
        <span aria-hidden="true">‹</span> Library
      </Link>
      <section className="detail-hero">
        <GameCover game={game} size="tall" />
        <div className="detail-info">
          <p className="eyebrow">
            {game.genre} · {game.core.toUpperCase()}
          </p>
          <h1 className="detail-title">{game.title}</h1>
          <p className="detail-description">{game.description}</p>
          <p className="muted">Added {new Date(game.createdAt).toLocaleDateString()}</p>
          <div className="actions">
            <Link to={`/play/${game.id}`} className="button primary button-large">
              <span aria-hidden="true">▶</span> Play
            </Link>
          </div>
        </div>
      </section>

      <section className="detail-saves" aria-labelledby="saves-heading">
        <h2 id="saves-heading" className="section-title">
          Your saves
        </h2>
        {saves.length === 0 ? (
          <p className="empty">No saves yet. Play and click Save to keep your spot.</p>
        ) : (
          <ul className="save-list">
            {saves.map((save) => (
              <li key={save.id} className="save-row">
                <span className={`badge badge-${save.kind}`}>{save.kind}</span>
                <span className="save-when">{savedAt(new Date(save.createdAt))}</span>
                <Link to={`/play/${game.id}?saveId=${save.id}`} className="button">
                  Resume
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
