// Generated covers. Games have no cover image, so each one gets a gradient
// picked from a hash of its id, the same on every page and every visit.

import type { Game } from './types.ts'

const PALETTES: ReadonlyArray<readonly [string, string]> = [
  ['#ff5f6d', '#ffc371'],
  ['#36d1dc', '#5b86e5'],
  ['#8e2de2', '#4a00e0'],
  ['#11998e', '#38ef7d'],
  ['#fc466b', '#3f5efb'],
  ['#f7971e', '#e94057'],
  ['#00c6ff', '#0052d4'],
  ['#ee0979', '#ff6a00'],
  ['#43cea2', '#185a9d'],
  ['#c471f5', '#fa71cd'],
]

function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

/** The two gradient colors of a game's cover. */
export function coverColors(game: Pick<Game, 'id'>): readonly [string, string] {
  return PALETTES[hash(game.id) % PALETTES.length] ?? ['#36d1dc', '#5b86e5']
}

/** Up to two letters for the big glyph on a cover: "Bomb Sweeper" gives "BS". */
export function coverGlyph(title: string): string {
  const [first, second] = title.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word))
  if (!first) return '?'
  if (!second) return first.slice(0, 2).toUpperCase()
  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

/** Original artwork templates; presentation only, no API contract changes. */
export const COVER_TEMPLATES = [
  { id: 'orbit', label: 'Orbital courier', src: '/covers/orbit.png' },
  { id: 'ruins', label: 'Emerald ruins', src: '/covers/ruins.png' },
  { id: 'velocity', label: 'Cloud circuit', src: '/covers/velocity.png' },
  { id: 'prism', label: 'Glass puzzle', src: '/covers/prism.png' },
] as const

/** New imports receive artwork automatically, consistently across visits. */
export function coverTemplate(game: Pick<Game, 'id' | 'genre'>) {
  const genre = game.genre.toLowerCase()
  if (/puzzle|strategy|board/.test(genre)) return COVER_TEMPLATES[3]
  if (/racing|sport|driving/.test(genre)) return COVER_TEMPLATES[2]
  if (/adventure|rpg|role|platform/.test(genre)) return COVER_TEMPLATES[1]
  if (/shoot|action|space/.test(genre)) return COVER_TEMPLATES[0]
  return COVER_TEMPLATES[hash(game.id) % COVER_TEMPLATES.length] ?? COVER_TEMPLATES[3]
}
