import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import GameCover from '../components/GameCover.tsx'
import { ApiError, errorMessage, listGames, listSaves } from '../lib/api.ts'
import { signInLink } from '../lib/nextPath.ts'
import { dateGroup, savedAt } from '../lib/time.ts'
import type { Game, Save } from '../lib/types.ts'
import { useCurrentUser } from '../lib/useCurrentUser.ts'

// M3: the signed-in player's saves from GET /api/saves, newest first, on any
// device they sign in on. Resume opens the Play page with ?saveId=.

export default function MySavesPage() {
  const userId = useCurrentUser()?.id
  // Tagged with the account they belong to, so another account's saves or
  // errors never show after signing in as someone else.
  const [loaded, setLoaded] = useState<{ userId: string; saves: Save[] } | null>(null)
  const [games, setGames] = useState<Map<string, Game>>(new Map())
  // `for` is null when the error signed the player out (an expired sign-in).
  const [failure, setFailure] = useState<{ for: string | null; message: string } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([listSaves(), listGames()])
      .then(([loadedSaves, loadedGames]) => {
        if (cancelled) return
        setLoaded({ userId, saves: loadedSaves })
        setGames(new Map(loadedGames.map((game) => [game.id, game])))
        setFailure(null)
      })
      .catch((reason: unknown) => {
        // A 401 also signs out, which cancels this effect; still say why.
        if (reason instanceof ApiError && reason.status === 401) {
          setFailure({ for: null, message: errorMessage(reason) })
        } else if (!cancelled) {
          setFailure({ for: userId, message: errorMessage(reason) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const saves = userId && loaded?.userId === userId ? loaded.saves : null
  const error = failure && failure.for === (userId ?? null) ? failure.message : null

  if (!userId) {
    return (
      <div className="panel">
        <h1>My Saves</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p>Sign in to see your saves on any device.</p>
        <Link to={signInLink('/saves')} className="button primary">
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
                    {save.label && <span className="save-label">{save.label}</span>}
                    <span className="muted">{savedAt(new Date(save.createdAt))}</span>
                  </span>
                  <span className={`badge badge-${save.kind}`}>{save.kind}</span>
                  <Link
                    to={`/play/${save.gameId}?saveId=${save.id}`}
                    className="button"
                    aria-label={`Resume ${game?.title ?? 'game'}, ${save.kind}${save.label ? `, ${save.label},` : ''} from ${new Date(save.createdAt).toLocaleString()}`}
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
