# Save to the API from the Play page and resume in a fresh tab

- **Status:** in progress
- **Owner:** Kenyang
- **Milestone:** M2 Catalog management and sessions (save-state check Nov 15)
- **Date:** 2026-11-12
- **PR:** <link once opened>

## Goal
Opening a game starts a session through the API and keeps it alive with a
heartbeat. Clicking Save uploads the current save state to the API. Opening
`/play/{gameId}?saveId={id}` in a fresh tab downloads that save and the game
comes back at the same spot. This is the web half of the Nov 15 check: "a save
uploads to the API and loads back in a fresh tab".

## Context
The Play page (PR #6) downloads the game file, runs it in EmulatorJS and keeps
Export state and Load state in this tab's session storage. `api.ts` already has
`startSession`, `heartbeat`, `endSession`, `uploadSave` and `saveFileUrl`, all
returning mocks. The contract types (`StartSessionResponse`, `Save`) are on
`main`. Soham's session and save endpoints aren't on `main` yet. There's no
sign-in until M3, so the API decides which user owns a session for now.

## Approach
`api.ts` switches `startSession`, `heartbeat`, `endSession` and `uploadSave` to
real calls; their signatures stay. It gets one new function,
`downloadSaveFile(url)`, the twin of `downloadGameFile`. The page downloads the
save itself and calls `emulator.loadSaveState` once the game runs, instead of
handing the URL to EmulatorJS through `EJS_loadStateURL`, for the same reason as
the game file: EmulatorJS shows a failed download only on its own screen.

`uploadSave` sends multipart form data, like the game upload: a `kind` field
(`manual` or `autosave`) and the state as a file field named `state`. The
contract doesn't fix the upload format yet, so Soham confirms it before either
side merges.

If `POST /api/sessions` fails, the page still plays the game the M1 way (game
file from `GET /api/games/{id}/file`) and says saving to the server is off. That
keeps `main` deployable if this merges before the endpoints do, and keeps the
Nov 8 demo steps working.

Rejected: keeping the mocks until Soham merges. The mocks can't carry a save to
a fresh tab, so the check could only be tried after both PRs land.

## Steps
- [ ] `api.ts`: real `startSession`, `heartbeat`, `endSession`, `uploadSave`; new
  `downloadSaveFile`. **Contract:** the multipart field names for `uploadSave`.
- [ ] `PlayPage.tsx`: start a session, heartbeat every 30 s, End button, end the
  session on leave.
- [ ] `PlayPage.tsx`: Save button uploads a manual save and offers "Resume in a
  new tab"; `?saveId=` resumes from that save.
- [ ] Remove Export state and Load state once the Nov 15 check passes (follow-up).

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Download the save in `api.ts`, load it with `loadSaveState` after start | Errors reach the page as plain messages | `EJS_loadStateURL`, which fails silently |
| Fall back to M1 play when the session can't start | `main` stays playable before the endpoints land | Blocking the page on the API |
| Keep Export and Load state for now | Nov 8 demo steps still work while the endpoints land | Removing them in this PR |

## Out of scope
Autosave every 60 s and the last autosave on tab close (M3, M4), pause and
resume (M4), sign-in (M3), the My Saves list (already calls `listSaves`).

## Verification
- `pnpm --dir web lint`, `typecheck` and `build` pass.
- With Soham's endpoints running and a game imported: open a game, click Play,
  play a bit, click Save. Click "Resume in a new tab". The game starts at the
  same spot, and the Network tab shows `POST /api/sessions` with `saveId` and
  `GET /api/saves/{id}/file`.
- With the API's session endpoints missing: the game still plays, and the page
  says saving to the server is off.
- Moves forward the M2 exit check, "a save uploads to the API and loads back in
  a fresh tab".
