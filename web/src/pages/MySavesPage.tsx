import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { errorMessage, getCurrentUser, listGames, listSaves } from '../lib/api.ts'
import type { Game, Save } from '../lib/types.ts'

export default function MySavesPage() {
  const userId = getCurrentUser()?.id
  const [saves, setSaves] = useState<Save[] | null>(null)
  const [games, setGames] = useState<Map<string, Game>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([listSaves(), listGames()])
      .then(([loadedSaves, loadedGames]) => {
        if (cancelled) return
        setSaves(loadedSaves)
        setGames(new Map(loadedGames.map((game) => [game.id, game])))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) {
    return (
      <>
        <h1>My Saves</h1>
        <p>
          <Link to="/sign-in">Sign in</Link> to see your saves.
        </p>
      </>
    )
  }

  return (
    <>
      <h1>My Saves</h1>
      {error && <p className="error">{error}</p>}
      {saves === null && !error && <p className="muted">Loading…</p>}
      {saves?.length === 0 && <p className="muted">No saves yet. Play a game and click Save.</p>}
      {saves && saves.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Kind</th>
              <th>Saved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {saves.map((save) => (
              <tr key={save.id}>
                <td>{games.get(save.gameId)?.title ?? save.gameId}</td>
                <td>
                  <span className="badge">{save.kind}</span>
                </td>
                <td>{new Date(save.createdAt).toLocaleString()}</td>
                <td>
                  <Link to={`/play/${save.gameId}?saveId=${save.id}`}>Resume</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
