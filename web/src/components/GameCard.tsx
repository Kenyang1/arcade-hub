import { Link } from 'react-router'
import type { Game } from '../lib/types.ts'

export default function GameCard({ game }: { game: Game }) {
  return (
    <li className="card">
      <h2>
        <Link to={`/games/${game.id}`}>{game.title}</Link>
      </h2>
      <p className="muted">
        {game.genre} · {game.core.toUpperCase()}
      </p>
      <p>{game.description}</p>
      <Link to={`/play/${game.id}`} className="button primary">
        Play
      </Link>
    </li>
  )
}
