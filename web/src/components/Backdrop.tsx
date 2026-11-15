import { COVER_TEMPLATES, coverTemplate } from '../lib/cover.ts'
import type { Game } from '../lib/types.ts'

/**
 * The blurred artwork behind the page. Stable layers let rapid selection
 * changes reverse a crossfade smoothly; each layer is a small (about 5 KB)
 * image, so keeping all four loaded costs little.
 */
export default function Backdrop({ game }: { game: Game }) {
  const selected = coverTemplate(game).id
  return (
    <div className="backdrop" aria-hidden="true">
      {COVER_TEMPLATES.map((template) => (
        <img
          key={template.id}
          className="backdrop-art"
          data-active={template.id === selected}
          src={template.backdrop}
          alt=""
          decoding="async"
        />
      ))}
    </div>
  )
}
