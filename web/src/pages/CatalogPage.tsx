import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import Backdrop from '../components/Backdrop.tsx'
import GameCard from '../components/GameCard.tsx'
import { errorMessage, listGames, listSaves } from '../lib/api.ts'
import { dateGroup, relativeTime } from '../lib/time.ts'
import type { Game, Save } from '../lib/types.ts'
import { useCurrentUser } from '../lib/useCurrentUser.ts'
import { useShortcuts } from '../lib/useShortcuts.ts'

type SortKey = 'title' | 'newest' | 'genre'
type View = 'grid' | 'list'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title A–Z' },
  { key: 'newest', label: 'Newest' },
  { key: 'genre', label: 'Genre' },
]

const VIEW_KEY = 'arcade-hub.libraryView'
const RECENT_LIMIT = 6
/** How long typing must pause before the search goes to the API. */
const SEARCH_DELAY_MS = 250

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    // Storage can be blocked (private window); the grid is the default.
    return 'grid'
  }
}

function storeView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage can be blocked; the choice then lasts until the page closes.
  }
}

function sortGames(games: Game[], sort: SortKey): Game[] {
  const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title)
  const sorted = [...games]
  if (sort === 'title') return sorted.sort(byTitle)
  if (sort === 'newest') return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return sorted.sort((a, b) => a.genre.localeCompare(b.genre) || byTitle(a, b))
}

interface RecentEntry {
  game: Game
  /** Latest save time for played games, the date added otherwise. */
  when: Date
  saveCount: number
}

/**
 * The games the player saved in, latest first. We don't track play time, so the
 * latest save stands in for "last played". With no saves, the newest games.
 */
function recentEntries(games: Game[], saves: Save[]): { played: boolean; entries: RecentEntry[] } {
  const stats = new Map<string, { latest: string; count: number }>()
  for (const save of saves) {
    const current = stats.get(save.gameId)
    if (!current) stats.set(save.gameId, { latest: save.createdAt, count: 1 })
    else {
      current.count += 1
      if (save.createdAt > current.latest) current.latest = save.createdAt
    }
  }
  const played = games
    .filter((game) => stats.has(game.id))
    .map((game) => {
      const stat = stats.get(game.id)!
      return { game, when: new Date(stat.latest), saveCount: stat.count }
    })
    .sort((a, b) => b.when.getTime() - a.when.getTime())
  if (played.length > 0) return { played: true, entries: played.slice(0, RECENT_LIMIT) }
  const newest = sortGames(games, 'newest')
    .slice(0, RECENT_LIMIT)
    .map((game) => ({ game, when: new Date(game.createdAt), saveCount: 0 }))
  return { played: false, entries: newest }
}

function recentMeta(entry: RecentEntry, played: boolean): string {
  if (!played) return `Added ${relativeTime(entry.when)} · ${entry.game.genre}`
  const saves = entry.saveCount === 1 ? '1 save' : `${entry.saveCount} saves`
  return `Last played ${relativeTime(entry.when)} · ${saves}`
}

const DIRECTIONS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

/** Arrow keys move focus to the next card on screen, across rows and sections. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const direction = DIRECTIONS[event.key]
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return
  const current = (event.target as HTMLElement).closest<HTMLElement>('[data-card]')
  if (!current) return
  const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-card]'))
  const index = cards.indexOf(current)
  let next: HTMLElement | undefined
  if (direction === 'left') next = cards[index - 1]
  else if (direction === 'right') next = cards[index + 1]
  else {
    const from = current.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    let best = Infinity
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      const below = rect.top >= from.bottom - 4
      const above = rect.bottom <= from.top + 4
      if (direction === 'down' ? !below : !above) continue
      const dy = direction === 'down' ? rect.top - from.bottom : from.top - rect.bottom
      const dx = Math.abs(rect.left + rect.width / 2 - fromX)
      const score = dy * 4 + dx
      if (score < best) {
        best = score
        next = card
      }
    }
  }
  if (!next) return
  event.preventDefault()
  next.focus()
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2" y="3" width="16" height="3" rx="1.5" fill="currentColor" />
      <rect x="2" y="8.5" width="16" height="3" rx="1.5" fill="currentColor" />
      <rect x="2" y="14" width="16" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export default function CatalogPage() {
  const navigate = useNavigate()
  const signedIn = useCurrentUser() !== null
  const [search, setSearch] = useState('')
  // The search the API last got. It trails `search` until typing pauses, so
  // typing a title sends one request, not one per key.
  const [query, setQuery] = useState('')
  const [games, setGames] = useState<Game[] | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [error, setError] = useState<string | null>(null)
  // Kept apart from `error`: browsing needs no sign-in, so a failed saves
  // request (an expired token, say) only costs the Recent row.
  const [savesError, setSavesError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('title')
  const [view, setView] = useState<View>(readView)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), search.trim() === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    listGames({ search: query })
      .then((result) => {
        if (cancelled) return
        setGames(result)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    listSaves()
      .then((result) => {
        if (cancelled) return
        setSaves(result)
        setSavesError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setSavesError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const searching = query.trim() !== ''
  const recent = useMemo(
    () => (games && !searching ? recentEntries(games, saves) : { played: false, entries: [] }),
    [games, saves, searching],
  )
  const library = useMemo(() => (games ? sortGames(games, sort) : []), [games, sort])
  const selected =
    games?.find((game) => game.id === selectedId) ?? recent.entries[0]?.game ?? library[0] ?? null

  function changeView(next: View) {
    setView(next)
    storeView(next)
  }

  useShortcuts({
    '/': (event) => {
      event.preventDefault()
      searchRef.current?.focus()
    },
    s: () => {
      const index = SORTS.findIndex((option) => option.key === sort)
      setSort(SORTS[(index + 1) % SORTS.length]?.key ?? 'title')
    },
    v: () => changeView(view === 'grid' ? 'list' : 'grid'),
    // The focused card wins over `selected`, which also follows the mouse.
    p: () => {
      const focused = document.activeElement?.closest<HTMLElement>('[data-game-id]')?.dataset.gameId
      const id = focused ?? selected?.id
      if (id) navigate(`/play/${id}`)
    },
  })

  const select = (game: Game) => setSelectedId(game.id)
  // A date-group label shows above the first card of each group only.
  const groupLabels = recent.entries.map((entry, index) => {
    const group = dateGroup(entry.when)
    const previous = recent.entries[index - 1]
    return previous && dateGroup(previous.when) === group ? '' : group
  })

  return (
    <>
      {selected && <Backdrop game={selected} />}
      <header className="launcher-intro">
        <p className="eyebrow">Your next adventure</p>
        <h1>Time to play.</h1>
        <p>A little nostalgia. A new high score.</p>
      </header>
      <div className="launcher" onKeyDown={moveFocus}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {games === null && !error && <p className="muted">Loading…</p>}
        {savesError && !searching && (
          <p className="muted" role="status">
            Your recent games couldn't load: {savesError}
          </p>
        )}

        {recent.entries.length > 0 && (
          <section className="recent" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="section-title">
              {recent.played ? 'Recent games' : 'New in the arcade'}
            </h2>
            <ul className="recent-row">
              {recent.entries.map((entry, index) => {
                const featured = index === 0
                return (
                  <li key={entry.game.id} className={featured ? 'recent-item recent-item-featured' : 'recent-item'}>
                    <span className="group-label">{groupLabels[index]}</span>
                    <GameCard
                      game={entry.game}
                      variant={featured ? 'featured' : 'tall'}
                      meta={featured ? recentMeta(entry, recent.played) : undefined}
                      onSelect={select}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="library" aria-labelledby="library-heading">
          <div className="library-bar">
            <h2 id="library-heading" className="section-title">
              {searching ? 'Search results' : 'Full library'}
            </h2>
            <label className="sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                {SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                placeholder="Search games"
                aria-label="Search games"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') event.currentTarget.blur()
                }}
              />
            </form>
            <div className="view-toggle" role="group" aria-label="Display mode">
              <button
                type="button"
                className="icon-button"
                aria-pressed={view === 'grid'}
                aria-label="Grid"
                onClick={() => changeView('grid')}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-pressed={view === 'list'}
                aria-label="List"
                onClick={() => changeView('list')}
              >
                <ListIcon />
              </button>
            </div>
          </div>

          {games?.length === 0 && (
            <p className="empty">{searching ? 'No games match that search.' : 'No games in the library yet.'}</p>
          )}
          {library.length > 0 && (
            <ul className={view === 'grid' ? 'library-grid' : 'library-list'}>
              {library.map((game) => (
                <li key={game.id}>
                  <GameCard
                    game={game}
                    variant={view === 'grid' ? 'tall' : 'row'}
                    meta={view === 'grid' ? game.genre : undefined}
                    onSelect={select}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
