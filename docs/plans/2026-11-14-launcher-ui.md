# Restyle the web app as a game-launcher library

- **Status:** done
- **Owner:** Kenyang
- **Milestone:** M2 (UI polish ahead of the M5 phone-width pass)
- **Date:** 2026-11-14
- **PR:** https://github.com/Kenyang1/arcade-hub/pull/21

## Goal

Players land on a page that looks like a console game launcher instead of a
boilerplate list: a "Recent games" row with a big featured card, a blurred hero
background taken from the selected game, and a "Full library" grid of tall
cover cards with sort and grid/list toggles. Every page shares the same look in
light and dark themes, works at 400 px, and can be driven with the keyboard.

## Context

- `web/src/index.css` holds one dark palette and plain styles; pages are bare
  headings, a card grid and a table.
- `Game` (packages/contracts) has no cover image and there is no play history
  or play time. The catalog has one real game today (Bomb Sweeper), so the
  design must look complete with one to four games.
- `listGames` is a real call on `main`; `listSaves` still returns mocks.
- Draft PR 16 (`feat/play-page-saves`) rewrites `PlayPage.tsx` logic and
  `api.ts`, so this work only touches `PlayPage.tsx` markup classes.
- The layout reference is a third-party launcher concept. Only the layout,
  spacing, card style, themes and hint bar carry over: no names, logos or
  commercial cover art.

## Approach

Design tokens (colors, radii, shadows, focus ring) as CSS custom properties on
`:root`, with a light set and a dark set switched by `prefers-color-scheme`.
A shared shell in `Layout.tsx`: slim top bar (brand, nav, account, "Add a
game") and a bottom hint bar whose shortcuts come from the current page.

Covers are generated: `GameCover` draws a gradient picked from a hash of the
game id, a pixel pattern and the title, so every game gets a stable, distinct
cover without any image files. The hero background is the same gradient,
blurred and faded into the page.

"Recent games" comes from the player's saves (`listSaves`): games ordered by
their latest save, grouped as Today / This week / Earlier, with the save count
and last-played time instead of play time (we don't track play time). With no
saves, the row shows the newest games under "New in the arcade".

Keyboard: `/` focuses search, `S` cycles the sort, `V` toggles grid/list,
arrow keys move between cards, Enter opens the focused game. Shortcuts are
ignored while typing in a field and on the Play page, where the keys belong to
the game.

Rejected: a CSS framework (Tailwind) — new dependency and a rewrite of every
class for little gain; real cover images — no field in the contract, and a
contract change for styling isn't worth it now.

## Steps

- [x] Tokens, base styles, light/dark themes in `web/src/index.css`.
- [x] Shell: `Layout.tsx` top bar and `HintBar.tsx`; `GameCover.tsx` generated covers.
- [x] Catalog page: hero, Recent games row, Full library grid/list, sort, shortcuts (`CatalogPage.tsx`, `GameCard.tsx`).
- [x] Game details, My Saves, Sign-in and Not found pages in the new style.
- [x] Play page: class names and wrapper markup only (no logic change).
- [x] Lint, typecheck, build; check desktop and 400 px in both themes with mock data.

No step changes `packages/contracts`, an `api.ts` signature or the data model.

## Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| Generated gradient covers | No cover field in `Game`; looks finished with one game | Placeholder grey boxes; adding `coverUrl` to the contract |
| Recent games from saves | Only signal of play we have | Tracking play time (new data) |
| Theme follows `prefers-color-scheme` only | No settings page yet | A manual toggle stored in localStorage |
| Shortcuts off on the Play page | Keys go to the emulator | Global shortcuts everywhere |
| Cover art ships as WebP: 960 px for cards, 160 px for the backdrop (review fix) | The 1254 px PNGs were about 2.2 MB each, and the backdrop loaded all four: about 9 MB on a first visit. The WebP set is under 450 KB, and the backdrop layers are about 5 KB each because they are blurred anyway | Keeping the PNGs and lazy-loading the backdrop (the backdrop layers are always on screen) |
| Search waits 250 ms after typing stops (review fix) | `listGames` is a real API call; one request per keystroke was wasted server work | Filtering on the client (the API owns search) |
| A failed saves request only costs the Recent row, with a quiet note (review fix) | Browsing needs no sign-in, so an expired token must not put an error on the catalog | Sharing the page's `error` state |
| P plays the focused card, else the hovered or first one (review fix) | Hover also moves the selection for the backdrop; keyboard focus is what the player means | Dropping hover selection, which the reference design uses |
| No "Add a game" button until the add page exists (review fix) | A disabled control on every page explained only by a tooltip that keyboard and touch users can't reach | Keeping it disabled |

## Out of scope

Real cover art, play-time tracking, a theme toggle, gamepad navigation, the
Add/Edit game pages themselves, and the "Add a game" button, which comes back with them.

## Verification

```bash
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web dev
```

With mock data: open `/`, `/games/g1`, `/saves`, `/sign-in`, `/play/g1` at
desktop width and 400 px, in light and dark. Tab through every card and button
and check the focus ring; press `/`, `S`, `V`, arrows and Enter on the catalog.
Moves forward the M5 phone-width pass.

## Notes from building it

- The Play page needed no change at all: `Layout.tsx` adds `main-play` to
  `<main>` on `/play/*`, and the styles hang off that class, so PR 16 merges
  cleanly.
- "Add a game" was a disabled button until the M2 add page exists; the review removed it until then.
- The launcher column uses `minmax(0, 1fr)`, otherwise the recent row widened
  the page at 400 px.

## Glass launcher refinement (2026-11-14)

- [x] Floating glass navigation, larger featured cover, responsive controls, and light/dark tokens.
- [x] Four original generated cover templates selected by genre, with a stable ID fallback; prompts in `web/public/covers/README.md`.
- [x] Short page fades, reversible backdrop crossfades, consistent press feedback, and immediate keyboard navigation. Reduced motion disables transitions; Play page logic remains unchanged.
- [x] Lint, typecheck, production build and browser navigation checks.
- [x] Desktop and 400 px screenshots captured with fake games in `docs/screenshots/`. At 400 px, document scroll width equals client width (385 px plus browser scrollbar).

Artwork templates replace the original gradient-only covers. They are decorative genre art, not game screenshots. Automatic assignment requires no cover field or API changes; a manual template picker and import screen remain out of scope. Screenshots document dark mode. Physical-device frame-rate testing and a running emulator session remain unverified.
