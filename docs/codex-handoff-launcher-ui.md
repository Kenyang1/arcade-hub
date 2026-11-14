# Handoff: Arcade Hub launcher UI (for Codex)

You're picking up UI work on Arcade Hub, a CS 370 web arcade. Players browse
homebrew NES games, play them in the browser with EmulatorJS, and save and
resume progress. This branch already restyles the web app as a console-style
game launcher. Use it as the base for further UI experiments.

Read `CLAUDE.md` at the repo root before changing anything. It's the source of
truth for repo rules. This file only summarizes what matters for UI work.

## Where things are

- **Branch:** `feat/launcher-ui`, based on `origin/main` (`5b8574c`).
  - Commit `7c26cbf` adds the plan, `docs/plans/2026-11-14-launcher-ui.md`.
  - Commit `1f7b102` is the restyle.
- **Checkout:** the git worktree `C:\Users\kenya\repos\arcade-hub-launcher-ui`.
  The main checkout `C:\Users\kenya\repos\arcade-hub` is on another branch
  (`feat/ai-core`) and other agents use it. Don't switch branches there.
- **Not pushed, no PR.** For experiments, branch from `feat/launcher-ui`
  (for example `git switch -c feat/launcher-ui-codex`) so the base stays clean.

## Stack

- React 19 + TypeScript + Vite 8 in `web/`, with React Router 7.
- pnpm workspace. The other packages are `api/` (Express) and
  `packages/contracts` (zod schemas).
- Plain CSS in one file, `web/src/index.css`. There's no CSS framework, and
  adding one is a decision for the owner (Kenyang), not an experiment.
- Linting uses oxlint. `tsconfig` has `noUncheckedIndexedAccess`, so
  `array[i]` can be `undefined`.

## Rules you must keep (from CLAUDE.md)

- **Data access:** pages and components get data only from
  `web/src/lib/api.ts` and types only from `web/src/lib/types.ts`. Never call
  `fetch` in a page or component; oxlint enforces this.
- **No contract changes:** don't change `packages/contracts` or any `api.ts`
  function signature. Those are contract changes that need both owners.
- **Don't touch:** `web/src/lib/emulator.ts` is the only module that touches
  EmulatorJS. Leave its behaviour alone.
- **Play page:** draft PR 16 rewrites `PlayPage.tsx` logic. Keep any Play page
  change to CSS. Style it through the `.main-play` class that `Layout.tsx`
  puts on `<main>`, not by editing `PlayPage.tsx`.
- **Never put in git:** game files (ROMs), save files, secrets, real people's
  data, or commercial game art. Mocks and screenshots use fake data only
  (`player1`, the games in `mocks.ts`).
- **Design rules:**
  - Every page works at 400 px with no horizontal scroll.
  - The Play page works with only a keyboard.
  - API errors show as plain messages, never a raw status code.
- **Commits:**
  - Use Conventional Commits with scope `ui`, for example
    `feat(ui): add genre filter chips`.
  - Run `git diff --staged` before every commit to check for the forbidden
    files above.

## Design reference

The look follows a game-launcher concept: a "Recent games" row with one big
featured card, a blurred hero background from the selected game, a "Full
library" grid of tall cover cards, a cyan focus ring, a slim top bar and a
bottom hint bar of keyboard shortcuts. Only the layout and visual language
carry over from that reference. Never use a real emulator's or console maker's
name, logo or cover art.

## Design system

### Tokens (`web/src/index.css`, `:root`)

The light theme is the default. Dark overrides live in
`@media (prefers-color-scheme: dark)`. Every color comes from a token, so a
new theme means new token values, not new rules.

| Token | Use |
| --- | --- |
| `--bg`, `--bg-glow` | Page background and the soft corner glow |
| `--surface`, `--surface-2`, `--surface-glass` | Cards, inputs, and the frosted top and hint bars |
| `--border` | Hairlines |
| `--text`, `--muted` | Body text and secondary text |
| `--accent`, `--accent-text`, `--accent-soft`, `--accent-glow`, `--on-accent` | Cyan accent: fills, links, tints, the focus glow, text on accent |
| `--danger`, `--danger-soft` | Error messages |
| `--shadow-card`, `--shadow-lift` | Resting and hovered card shadows |
| `--backdrop-opacity` | Strength of the blurred hero |
| `--radius-card`, `--radius-control` | Corner radii |
| `--topbar-height`, `--hintbar-height`, `--gutter` | Layout sizes |

### Components (`web/src/components/`)

- **`Layout.tsx`:** the shell.
  - Contains the skip link, the top bar (brand mark, Library and My Saves
    nav, a disabled "Add a game" pill, the account chip) and `<main>`.
  - Puts `main-play` on `<main>` for `/play/*`.
  - `hintsFor(pathname)` decides which shortcuts the hint bar shows.
- **`HintBar.tsx`:** the fixed bottom bar. It takes `hints: { keys, label }[]`.
- **`GameCover.tsx`:** the generated cover.
  - Sizes: `tall` (3:4), `wide` (fills its parent), `thumb` (small, glyph
    only).
  - The colors come from `coverColors(game)` in `lib/cover.ts`, a hash of the
    game id. The glyph comes from `coverGlyph(title)`.
- **`GameCard.tsx`:** a link to `/games/:id` with three variants:
  - `featured`: the big card at the start of the recent row.
  - `tall`: a cover card.
  - `row`: the list view.
  Cards carry `data-card`, which the catalog's arrow-key navigation uses.
- **`Backdrop.tsx`:** the blurred, faded hero background behind the top of the
  catalog and details pages.

### Helpers (`web/src/lib/`)

- **`cover.ts`:** the gradient palettes and the cover glyph.
- **`time.ts`:**
  - `dateGroup` returns Today, Yesterday, This week, This month or Earlier.
  - `relativeTime` returns a phrase such as "3 h ago".
  - `savedAt` returns the timestamp line shown for a save.
- **`useShortcuts.ts`:** single-key page shortcuts. They're ignored while the
  player types in a field or holds a modifier key.

### Pages (`web/src/pages/`)

- **`CatalogPage.tsx`:**
  - The backdrop, then the recent row, then the library.
  - Recent games are built from `listSaves()`: games with saves, latest first,
    because we don't track play time. With no saves, the row shows the newest
    games as "New in the arcade".
  - Sort options: title, newest, genre.
  - The grid/list choice is stored in `localStorage` under
    `arcade-hub.libraryView`, inside try/catch.
  - Shortcuts: arrows move between cards, `/` focuses search, `S` changes the
    sort, `V` switches grid/list, `P` plays the selected game.
- **`GameDetailsPage.tsx`:** the hero (cover, genre and core label, big title,
  Play button) and the "Your saves" list. `P` plays, Esc returns to the
  library.
- **`MySavesPage.tsx`:** saves grouped by date, each a row card with a thumb
  cover, a kind badge and Resume.
- **`SignInPage.tsx`, `NotFoundPage.tsx`:** centered `.panel` cards.
- **`PlayPage.tsx`:** markup unchanged. It's styled by `.main-play`, `.player`
  and `.main-play .actions` in the CSS.

### Key CSS classes

| Area | Classes |
| --- | --- |
| Shell | `.topbar`, `.topnav`, `.pill`, `.account`, `.avatar`, `.hintbar`, `.hintbar-list` |
| Catalog | `.launcher` (grid with `minmax(0, 1fr)`; keep it, or the recent row widens the page at 400 px), `.recent-row`, `.recent-item`, `.recent-item-featured`, `.group-label`, `.library-bar`, `.sort`, `.search`, `.view-toggle`, `.library-grid`, `.library-list` |
| Cards | `.game-card` and its focus ring, `.game-row`, `.cover*` |
| Shared | `.panel`, `.section-title`, `.eyebrow`, `.badge`, `.badge-manual`, `.empty`, `.error` |
| Buttons | `button` and `.button`, with `.primary`, `.button-large`, `.icon-button`, `.link` |
| Phone layout | One `@media (max-width: 40rem)` block near the end of the file |

## Running it

The commands are the same in PowerShell and bash. Run them from the worktree
root.

```bash
pnpm install
pnpm --dir web dev            # http://localhost:5173, proxies /api to :5080
```

`listGames` and `getGame` are real calls on `main`, so the catalog needs
something on :5080. You have two options:

- **The real API.** `docker compose up -d mongo`, then `pnpm --dir api dev`.
  It shows whatever games are imported, maybe none.
- **A throwaway mock API.** Save the script below **outside the repo** and run
  it with `node mock-api.mjs`. It serves the fake games from `mocks.ts`. Game
  files return 404, so the Play page shows its "couldn't be loaded" message.
  That's expected.

```js
// mock-api.mjs: preview only. Keep this file outside the repo.
import { createServer } from 'node:http'
const games = [
  { id: 'g1', title: 'Star Courier', description: 'Deliver cargo across a hostile asteroid belt. Eight stages, one life.', genre: 'Shooter', core: 'nes', createdAt: '2026-10-25T12:00:00Z' },
  { id: 'g2', title: 'Dungeon Delve', description: 'Explore a forty-room dungeon and find the three keys before the torch burns out.', genre: 'Adventure', core: 'nes', createdAt: '2026-10-25T12:05:00Z' },
  { id: 'g3', title: 'Pixel Racer', description: 'Top-down racing against three rivals on twelve tracks.', genre: 'Racing', core: 'gb', createdAt: '2026-10-26T09:00:00Z' },
  { id: 'g4', title: 'Block Stacker', description: 'Falling blocks. Clear lines. Beat your high score.', genre: 'Puzzle', core: 'nes', createdAt: '2026-10-26T09:30:00Z' },
]
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(JSON.stringify(body)) }
  if (url.pathname === '/api/games') {
    const q = (url.searchParams.get('search') ?? '').toLowerCase()
    return send(200, games.filter((g) => g.title.toLowerCase().includes(q)))
  }
  const m = url.pathname.match(/^\/api\/games\/([^/]+)$/)
  if (m) {
    const g = games.find((x) => x.id === m[1])
    return g ? send(200, g) : send(404, { title: 'Not found', status: 404, detail: 'That game does not exist.' }, 'application/problem+json')
  }
  send(404, { title: 'Not found', status: 404 }, 'application/problem+json')
}).listen(5080, () => console.log('mock api on 5080'))
```

To see the "Recent games" row, sign in on `/sign-in` with any username and a
password of 8 or more characters (sign-in is mocked). That gives you the mock
user, and `listSaves()` returns mock saves for Star Courier and Dungeon Delve.

## Checks before you call anything done

```bash
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
```

Then check these in a browser:

1. Look at `/`, `/games/g1`, `/saves`, `/sign-in`, `/play/g1` and an unknown
   path.
2. Do it at desktop width and at 400 px, in both light and dark.
3. At 400 px, confirm `document.documentElement.scrollWidth` equals the
   viewport width.
4. Tab through every control and confirm each one shows a visible focus.
5. On the catalog, try the arrows, Enter, `/`, `S`, `V` and `P`.

## Ideas worth trying

These are suggestions, not commitments. Anything that changes data or the
contract needs Kenyang and Soham first.

- **Small catalog:** today there's one real game, Bomb Sweeper. Try a layout
  that still looks full with only one or two games, such as a bigger featured
  hero.
- **Featured card:** add a "Continue" button that resumes the latest save. It
  needs a layout that avoids nesting a button inside the card link.
- **Genre chips:** add filter chips above the library. `listGames` already
  accepts `genre`.
- **Theme toggle:** add a light/dark/system switch stored in `localStorage`,
  overriding `prefers-color-scheme` with a `data-theme` attribute on `<html>`.
- **Motion:** add subtle hover and selection motion, behind
  `prefers-reduced-motion`.
- **Play page:** try a focused "theater" layout using CSS only (see the rules
  above).
- **Gamepad navigation:** use the Gamepad API to move between cards the same
  way the arrow keys do.

## Known gaps

- **Covers:** they're all generated, because `Game` has no cover field. Adding
  one is a contract change.
- **Play time:** there is none. Recent games uses the latest save time instead.
- **"Add a game":** it stays disabled until the M2 add page exists.
- **Recent row:** it shows a thin horizontal scrollbar on phones.
