import type { CSSProperties } from 'react'
import { coverColors, coverGlyph } from '../lib/cover.ts'
import type { Game } from '../lib/types.ts'

/** The big blurred background behind the top of a page, taken from a game's cover. */
export default function Backdrop({ game }: { game: Game }) {
  const [from, to] = coverColors(game)
  const style = { '--cover-from': from, '--cover-to': to } as CSSProperties
  return (
    <div className="backdrop" style={style} aria-hidden="true">
      <span className="backdrop-glyph">{coverGlyph(game.title)}</span>
    </div>
  )
}
