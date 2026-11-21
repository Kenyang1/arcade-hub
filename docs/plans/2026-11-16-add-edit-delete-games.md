# Add, edit and delete games in the browser

- **Status:** done
- **Owner:** Kenyang
- **Milestone:** M2 (carried over; the M2 exit check is "add, edit and delete a game in the browser against the cluster")
- **Date:** 2026-11-16
- **PR:** https://github.com/Kenyang1/arcade-hub/pull/29

## Goal

A signed-in player can add a game to the catalog (title, description, genre,
console and the game file), fix its details later, and remove it, all from
the browser. Today the only way in is `import-games` from a terminal.

## Context

- `api.ts` has `createGame(input, file)`, `updateGame(id, input)` and
  `deleteGame(id)` with the final signatures. They returned mocks until the
  API's `POST`, `PUT` and `DELETE /api/games` landed (2026-11-19); the bodies
  are real calls now and the pages did not change.
- `listGames` and `getGame` are real calls, so a game "added" through the mock
  won't show in the catalog until the endpoints land. The pages are built and
  checked against the mocks; nothing in them changes when the backend lands.
- `GameInput` in `packages/contracts`: `title`, `description`, `genre`,
  `core` (`nes`, `snes`, `gb`, `gba`). Those shapes are unchanged; the
  multipart field name joins the contract as `GAME_FILE_FIELD = 'file'`
  (2026-11-19), which is a contract change and needs both reviewers.
- Errors per CLAUDE.md: 400 invalid input, 401 not signed in, 403 not yours,
  404 not found, 409 duplicate title. `errorMessage` turns them into text.
- Routes live in `web/src/App.tsx`; the hint bar in `Layout.tsx` lists
  shortcuts per path. Styles are in `web/src/index.css` (`.panel`, `.form`).

## Approach

One form page, `GameFormPage.tsx`, serves two routes: `/games/new` (empty
form plus a game-file picker) and `/games/:gameId/edit` (form filled from
`getGame`, no file picker, since `updateGame` takes no file). The edit page
also has a Delete section: clicking Delete shows an inline "Delete <title>?
This can't be undone" with Delete game and Cancel buttons. No `window.confirm`,
so it works the same with the keyboard and on a phone.

Client checks before any call: title, genre and console are required; on add,
a file is required and its extension must match the console (`.nes`; `.sfc`
or `.smc`; `.gb` or `.gbc`; `.gba`). The server still validates everything.
Signed-out players see "Sign in to add or edit games" with a link that comes
back to the form.

After add or edit the page goes to the game's details page; after delete, to
the library. Entry points: an "Add a game" link in the library header, and an
Edit link on the details page.

Rejected: a modal dialog over the catalog (harder to reach from a link, and
focus handling for little gain); separate add and edit pages (the same fields
twice); `window.confirm` for delete (blocks the page, can't be styled).

## Steps

- [x] Commit this plan.
- [x] `GameFormPage.tsx` with add and edit modes, validation and errors;
      routes in `App.tsx`; hint bar entries in `Layout.tsx`.
- [x] Delete with inline confirmation on the edit page.
- [x] Entry points: "Add a game" on `CatalogPage.tsx`, Edit (and the `E` key)
      on `GameDetailsPage.tsx`; styles in `index.css`.
- [x] Unit tests for the file-extension check (`web/src/lib/gameFile.ts`).
      Done in `web/src/lib/gameFile.test.ts`, with
      `docs/plans/2026-11-19-managed-play-web.md`.

The backend step (2026-11-19) added `GAME_FILE_FIELD` to `packages/contracts`.
No `api.ts` signature changed: only the three bodies became real calls.

## Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| One page for add and edit | Same fields, one place to fix | Two pages |
| Inline delete confirmation | Keyboard- and phone-friendly | `window.confirm`, modal |
| File required only on add | `updateGame` takes no file | Replacing the file on edit (needs a contract change) |
| Unit tests after PR 27 | PR 27 brings Vitest; two PRs adding it would conflict | Adding Vitest in this PR |

## Out of scope

- Replacing a game's file after it's added.
- Who may edit or delete which game: the server decides; the page shows its
  403 message.

## Verification

- `pnpm --dir web lint`, `typecheck`, `test`, `build`.
- `pnpm --dir web dev`, sign in, then: Add a game with an empty title (message,
  no call); with a `.gba` file for console NES (message); with a valid
  `.nes` file (goes to the new game's page, which now shows it). Open a game,
  Edit, change the genre, Save. Edit, Delete, Cancel (nothing happens), Delete,
  Delete game (back to the library).
- Whole flow with Tab, Enter and Esc only; at 400 px wide.
- The M2 exit check on the cluster: add, edit and delete a game from the
  browser against the cluster.
