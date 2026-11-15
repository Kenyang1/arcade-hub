// Cover art. Games have no cover image of their own, so each one gets one of
// four original artwork templates by genre, plus a gradient picked from a hash
// of its id that shows while the artwork loads. Both are the same on every
// page and every visit.

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

/** The two gradient colors behind a game's cover, shown while its artwork loads. */
export function coverColors(game: Pick<Game, 'id'>): readonly [string, string] {
  return PALETTES[hash(game.id) % PALETTES.length] ?? ['#36d1dc', '#5b86e5']
}

/**
 * Original artwork templates; presentation only, no API contract changes.
 * `src` is 960 px wide for cards; `backdrop` is 160 px wide, since the page
 * backdrop blurs it heavily.
 */
export const COVER_TEMPLATES = [
  { id: 'orbit', label: 'Orbital courier', src: '/covers/orbit.webp', backdrop: '/covers/orbit-backdrop.webp' },
  { id: 'ruins', label: 'Emerald ruins', src: '/covers/ruins.webp', backdrop: '/covers/ruins-backdrop.webp' },
  { id: 'velocity', label: 'Cloud circuit', src: '/covers/velocity.webp', backdrop: '/covers/velocity-backdrop.webp' },
  { id: 'prism', label: 'Glass puzzle', src: '/covers/prism.webp', backdrop: '/covers/prism-backdrop.webp' },
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
