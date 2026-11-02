# Play a game on the Play page, with Export state and Load state

- **Status:** in progress
- **Owner:** Kenyang
- **Milestone:** M1 Thin real slice (Team demo Nov 8, steps 5 and 6)
- **Date:** 2026-11-02
- **PR:** <link once opened>

## Goal
Clicking Play on a game's details page starts that game in EmulatorJS with the
game file from `GET /api/games/{id}/file`. The player can click Export state,
reload the page, click Load state, and the game comes back at the same spot.
When this is done, `/spike` is gone, as the M0 plan asks.

## Context
`/spike` (PR #5) proved the save-state round trip with a game file picked from
disk, loaded through a `blob:` URL with `gameName` carrying the file extension
(see Decisions in `docs/plans/2026-10-21-m0-setup.md`). `src/lib/emulator.ts`
already has start, stop, pause, resume, getSaveState and loadSaveState. The
Play page is a stub with disabled buttons. The game file endpoint is Soham's
and isn't on `main` yet. Only the `fceumm` (NES) core is fetched.

## Approach
`api.ts` gets one new function, `downloadGameFile(url)`, that downloads the
game file as a `Blob` (with the bearer token, errors as `ApiError`). The page
turns it into a `blob:` URL and starts EmulatorJS with
`gameName: "<gameId>.nes"`, the same path the spike proved. The browser's
Network tab still shows the file coming from `/api/games/{id}/file`.

Export state keeps the state in this tab's session storage, one entry per game,
so it survives a reload. Uploading it is M2.

Rejected: passing `gameFileUrl(id)` straight to EmulatorJS. For a non-`blob:`
URL, EmulatorJS 4.2.3 names the file from the URL's last segment, so every game
would be written as `file` with no extension, and its ROM cache would key every
game under `file` (matched only by size). A failed download also shows
EmulatorJS's own "Network Error" and never tells the page, so the page would
wait forever.

## Steps
- [ ] `api.ts`: add `downloadGameFile(url)`. New function; no existing signature
      or contract type changes.
- [ ] `emulator.ts`: reject `start()` when EmulatorJS fails to start or takes
      over 30 s, turn off its ROM cache, add `focus()`, `isCoreSupported()` and
      `fileExtension()`.
- [ ] `lib/exportedState.ts`: keep exported states in session storage (from the spike).
- [ ] `PlayPage.tsx`: start the game, Export state, Load state, keyboard focus
      back to the game after each button, plain error messages, and a fallback
      to play a `.nes` file from disk when the server can't send the game.
- [ ] Remove `SpikePage.tsx` and its route.

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Download the game in `api.ts`, start EmulatorJS from a `blob:` URL | Keeps the file extension the spike needed, gives plain error messages, keeps every network call in `api.ts` | Handing EmulatorJS the API URL directly (see Approach) |
| `EJS_CacheLimit = 0` | With `blob:` URLs EmulatorJS would store a fresh copy of the game in IndexedDB on every start, under a random key it never reads back | Leaving the cache on |
| Only cores we fetch can start (`nes` today) | A missing core makes EmulatorJS fall back to its public CDN, which CLAUDE.md rules out | Letting other cores try |
| Load state resumes the game first if it is paused | The spike found a load sent while paused did not stick | Loading while paused |
| `saveId` in the URL is ignored until M3, with a note on the page | The save file endpoint lands in M3; asking EmulatorJS for it now would stop the game from starting | Passing `saveFileUrl` now |
| The Start button stub is gone; the game starts when the page opens | Demo step 5 is "click Play, the game runs". Start and End come back with sessions in M2 | A disabled Start button next to a running game |
| If the server can't send the game, the page offers a `.nes` file picker | Lets the page be tested before the file endpoint lands, and is a fallback if it slips before the demo. Nothing leaves the player's computer | No fallback |

## Out of scope
Sessions, heartbeat, autosave, uploading saves (M2 and M3), pause and resume
buttons (M4), cores other than `fceumm`.

## Verification
- `pnpm --dir web lint`, `typecheck` and `build` pass.
- With the API's file endpoint running and a game imported: open a game, click
  Play. The game runs within 10 s, and the Network tab shows `/emulatorjs/` and
  `/api/games/{id}/file`. Play with the keyboard, Export state, reload, Load
  state: the game comes back at the same spot (demo steps 5 and 6).
- Without the API: the page says the game couldn't be loaded and offers the file
  picker; picking a `.nes` file plays it and Export/Load work the same way.
- A GB game (mock "Pixel Racer") says its console isn't supported yet.
- `/spike` shows the Not found page.
