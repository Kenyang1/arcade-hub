import { useEffect, useState } from 'react'
import GameCard from '../components/GameCard.tsx'
import { errorMessage, listGames } from '../lib/api.ts'
import type { Game } from '../lib/types.ts'

export default function CatalogPage() {
  const [search, setSearch] = useState('')
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listGames({ search })
      .then((result) => {
        if (!cancelled) setGames(result)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [search])

  return (
    <>
      <h1>Catalog</h1>
      <form className="toolbar" role="search" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          placeholder="Search games"
          aria-label="Search games"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </form>
      {error && <p className="error">{error}</p>}
      {games === null && !error && <p className="muted">Loading…</p>}
      {games?.length === 0 && <p className="muted">No games match.</p>}
      {games && games.length > 0 && (
        <ul className="grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </ul>
      )}
    </>
  )
}
