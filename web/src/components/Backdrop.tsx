import { COVER_TEMPLATES, coverTemplate } from '../lib/cover.ts'
import type { Game } from '../lib/types.ts'

/** Stable layers let rapid selection changes reverse a crossfade smoothly. */
export default function Backdrop({ game }: { game: Game }) {
  const selected = coverTemplate(game).id
  return (
    <div className="backdrop" aria-hidden="true">
      {COVER_TEMPLATES.map((template) => (
        <img
          key={template.id}
          className="backdrop-art"
          data-active={template.id === selected}
          src={template.src}
          alt=""
          decoding="async"
        />
      ))}
    </div>
  )
}
