import { useId } from 'react'
import { Link } from 'react-router'
import type { Game } from '../lib/types.ts'
import GameCover from './GameCover.tsx'

interface Props {
  game: Game
  /** featured: the big card leading Recent games. tall: a cover card. row: list view. */
  variant: 'featured' | 'tall' | 'row'
  /** A short line under the title, such as "Last played 2 h ago". */
  meta?: string
  /** Called when the card gets focus or the pointer, so the page can follow it. */
  onSelect?: (game: Game) => void
}

/** A game in the launcher. Opens the game's page. Arrow keys move between cards (data-card). */
export default function GameCard({ game, variant, meta, onSelect }: Props) {
  const id = useId()
  const select = () => onSelect?.(game)
  const shared = {
    to: `/games/${game.id}`,
    'data-card': '',
    'data-game-id': game.id,
    onFocus: select,
    onMouseEnter: select,
  }

  if (variant === 'row') {
    return (
      <Link {...shared} className="game-row">
        <GameCover game={game} size="thumb" showTitle={false} />
        <span className="game-row-text">
          <span className="game-row-title">{game.title}</span>
          <span className="game-row-meta">
            {game.genre} · {game.core.toUpperCase()}
            {meta ? ` · ${meta}` : ''}
          </span>
          <span className="game-row-description">{game.description}</span>
        </span>
        <span className="game-row-go" aria-hidden="true">
          ›
        </span>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      // Named by the title alone, described by the meta line: the whole card's
      // text would make a paragraph-long link name for screen readers.
      <Link
        {...shared}
        className="game-card game-card-featured"
        aria-labelledby={`${id}-title`}
        aria-describedby={meta ? `${id}-meta` : undefined}
      >
        <GameCover game={game} size="wide" showTitle={false} />
        <span className="featured-text">
          <span className="featured-title" id={`${id}-title`}>
            {game.title}
          </span>
          <span className="featured-description">{game.description}</span>
          {meta && (
            <span className="featured-meta" id={`${id}-meta`}>
              {meta}
            </span>
          )}
          <span className="featured-open">Explore game <span aria-hidden="true">↗</span></span>
        </span>
      </Link>
    )
  }

  return (
    <Link {...shared} className="game-card game-card-tall">
      <GameCover game={game} size="tall" />
      {meta && <span className="card-meta">{meta}</span>}
    </Link>
  )
}
