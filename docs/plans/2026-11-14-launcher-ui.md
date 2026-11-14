# Restyle the web app as a game-launcher library

- **Status:** in progress
- **Owner:** Kenyang
- **Milestone:** M2 (UI polish ahead of the M5 phone-width pass)
- **Date:** 2026-11-14
- **PR:** not opened yet

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

- [ ] Tokens, base styles, light/dark themes in `web/src/index.css`.
- [ ] Shell: `Layout.tsx` top bar and `HintBar.tsx`; `GameCover.tsx` generated covers.
- [ ] Catalog page: hero, Recent games row, Full library grid/list, sort, shortcuts (`CatalogPage.tsx`, `GameCard.tsx`).
- [ ] Game details, My Saves, Sign-in and Not found pages in the new style.
- [ ] Play page: class names and wrapper markup only (no logic change).
- [ ] Lint, typecheck, build; check desktop and 400 px in both themes with mock data.

No step changes `packages/contracts`, an `api.ts` signature or the data model.

## Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| Generated gradient covers | No cover field in `Game`; looks finished with one game | Placeholder grey boxes; adding `coverUrl` to the contract |
| Recent games from saves | Only signal of play we have | Tracking play time (new data) |
| Theme follows `prefers-color-scheme` only | No settings page yet | A manual toggle stored in localStorage |
| Shortcuts off on the Play page | Keys go to the emulator | Global shortcuts everywhere |

## Out of scope

Real cover art, play-time tracking, a theme toggle, gamepad navigation, the
Add/Edit game pages themselves (the "Add a game" button waits for them).

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
