import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import GameCover from '../components/GameCover.tsx'
import { errorMessage, getCurrentUser, listGames, listSaves } from '../lib/api.ts'
import { dateGroup, savedAt } from '../lib/time.ts'
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
      <div className="panel">
        <h1>My Saves</h1>
        <p>Sign in to see your saves on any device.</p>
        <Link to="/sign-in" className="button primary">
          Sign in
        </Link>
      </div>
    )
  }

  // Newest first, so each group's first save starts a new heading. Sorted here
  // rather than trusting the API's order, so a label never shows up twice.
  const newestFirst = [...(saves ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const groups: { label: string; saves: Save[] }[] = []
  for (const save of newestFirst) {
    const label = dateGroup(new Date(save.createdAt))
    const last = groups.at(-1)
    if (last?.label === label) last.saves.push(save)
    else groups.push({ label, saves: [save] })
  }

  return (
    <>
      <h1 className="page-title">My Saves</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saves === null && !error && <p className="muted">Loading…</p>}
      {saves?.length === 0 && <p className="empty">No saves yet. Play a game and click Save.</p>}
      {groups.map((group) => (
        <section key={group.label} className="save-group" aria-label={group.label}>
          <h2 className="group-heading">{group.label}</h2>
          <ul className="save-list">
            {group.saves.map((save) => {
              const game = games.get(save.gameId)
              return (
                <li key={save.id} className="save-row save-row-game">
                  {game && <GameCover game={game} size="thumb" showTitle={false} />}
                  <span className="save-text">
                    <span className="save-title">{game?.title ?? 'Unknown game'}</span>
                    <span className="muted">{savedAt(new Date(save.createdAt))}</span>
                  </span>
                  <span className={`badge badge-${save.kind}`}>{save.kind}</span>
                  <Link
                    to={`/play/${save.gameId}?saveId=${save.id}`}
                    className="button"
                    aria-label={`Resume ${game?.title ?? 'game'}, ${save.kind} from ${new Date(save.createdAt).toLocaleString()}`}
                  >
                    Resume
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
