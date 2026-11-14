import type { CSSProperties } from 'react'
import { coverColors, coverGlyph } from '../lib/cover.ts'
import type { Game } from '../lib/types.ts'

interface Props {
  game: Game
  /** tall: library card. wide: featured card. thumb: list rows. */
  size: 'tall' | 'wide' | 'thumb'
  /** Draw the title on the cover. Off where the title is shown next to it. */
  showTitle?: boolean
}

/** A generated cover: the game's gradient, a pixel grid, a big glyph and the title. */
export default function GameCover({ game, size, showTitle = true }: Props) {
  const [from, to] = coverColors(game)
  const style = { '--cover-from': from, '--cover-to': to } as CSSProperties
  return (
    <span className={`cover cover-${size}`} style={style}>
      <span className="cover-glyph" aria-hidden="true">
        {coverGlyph(game.title)}
      </span>
      {size !== 'thumb' && (
        <span className="cover-core" aria-hidden="true">
          {game.core.toUpperCase()}
        </span>
      )}
      {showTitle && <span className="cover-title">{game.title}</span>}
    </span>
  )
}
