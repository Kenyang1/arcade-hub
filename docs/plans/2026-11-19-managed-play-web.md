# Pause and resume, session status, and a last autosave when the tab closes

- **Status:** in progress
- **Owner:** Kenyang
- **Milestone:** M4 Managed play (exit check Sun Nov 29)
- **Date:** 2026-11-19
- **PR:** <link once opened>

## Goal
On the Play page, a player can pause and resume the game, and the server
records it. The page shows the session's status (running, paused, idle or
ended). When the session goes idle, for example after the laptop slept, the
page says so and offers to resume from the last autosave. When the player
closes the tab or leaves the page, one last autosave goes up first, so the
M4 check "close the tab mid-game, lose at most 1 minute" loses close to
nothing.

## Context
- The spec's save-state flow (`docs/spec.md`): Pause or Resume calls
  `PATCH /api/sessions/{id}`; when the tab closes, the page tries one last
  autosave, then ends the session.
- On `main` (PR #18): `PATCH /api/sessions/{id}` takes `{ status: 'running' |
  'paused' }` and answers 409 once a session is `idle` or `ended`. Heartbeats
  and save uploads answer 409 the same way. `GET /api/sessions/{id}` returns
  the status and `lastAutosaveId`.
- In `web/src/lib/api.ts`, `updateSession` still returns a mock. The Play
  page's Pause button is disabled ("Lands in M4").
- A NES save state is about 14 KB. Browsers let a request that has to outlive
  the page (`fetch` with `keepalive`) carry up to 64 KB.

## Approach
`updateSession` becomes a real call; its signature stays. The Play page keeps
the session's status in state, sets it from each answer, and shows it as a
badge next to the title. Pause pauses EmulatorJS, reports `paused`, and
uploads an autosave of the paused spot, so nothing is lost if the player
walks away. Resume reports `running`, then resumes EmulatorJS.

When a heartbeat, save or status change answers 409, the page reads the
session (`getSession`), pauses the game, and shows its real status. An idle
or ended session offers "Keep playing from here": it starts a new session
and saves the current spot to it at once. (Changed while building: the plan
first had a link to resume from the last autosave, but the game is still in
memory, so the current spot is newer than any autosave.)

The last autosave has two cases:
- **Leaving the page inside the app** (Back to game, the top bar): the page is
  still alive, so it uploads the autosave and then ends the session, in order.
- **Closing the tab or reloading:** on `pagehide`, a new
  `uploadSaveOnExit(sessionId, state)` in `api.ts` sends the autosave with
  `keepalive`. It doesn't end the session: a `DELETE` sent at the same moment
  can reach the server first and turn the save into a 409. The session goes
  idle after 10 minutes instead, and resuming from My Saves works the same.

Rejected: `navigator.sendBeacon` (it can't send the `Authorization` header);
ending the session in the same `pagehide` (the race above); stopping
heartbeats while paused (a paused tab is still open, and idle means the page
is gone).

## Steps
- [x] Plan (this file).
- [x] `api.ts`: `updateSession` calls `PATCH /api/sessions/{id}`. New
  `uploadSaveOnExit(sessionId, state)`: the autosave upload with `keepalive`,
  skipped when the state is over 60 KB. **New `api.ts` function**, no change
  to existing signatures or to `packages/contracts`. Tests in `api.test.ts`.
- [x] `PlayPage.tsx`: Pause and Resume button wired to `emulator` and
  `updateSession`, with an autosave on pause. Session status badge
  (`index.css`). On a 409, read the session, pause, show idle or ended, and
  offer "Keep playing from here". Save is disabled once the session is idle
  or ended.
- [x] `PlayPage.tsx`: the last autosave on leaving the page (upload, then end)
  and on `pagehide` (`uploadSaveOnExit`).
- [x] `web/src/lib/gameFile.test.ts`: unit tests for `gameFileProblem` and
  `extensionsFor` (the open step from `2026-11-16-add-edit-delete-games.md`).
- [x] `docs/spec.md`: the save-state flow table covers pause, a 409, leaving
  the page, and closing the tab (the session is left to go idle).

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Tab close sends only the autosave, with `keepalive` | It needs the bearer token, and a `DELETE` in the same moment can beat the save to the server | `sendBeacon` (no auth header), ending the session too |
| Pause uploads an autosave | The paused spot is safe even if the session later goes idle | Relying on the last 60 s autosave |
| Heartbeats continue while paused | The tab is still open; idle is for a page that is gone or asleep | Stopping them, which would idle every long pause |
| An idle or ended session offers "Keep playing from here" | The game is still in memory, so a new session with an autosave of the current spot loses nothing | A link to resume from the last autosave, which can be up to a minute older |

## Out of scope
- Removing Export state and Load state (follow-up in
  `2026-11-12-play-page-sessions-and-saves.md`).
- Session status anywhere but the Play page. There is no endpoint that lists
  sessions.
- The idle-sweep job itself (Khoi) and its core method (Soham).

## Verification
- `pnpm --dir web lint`, `typecheck`, `test`, `build`.
- In the browser, signed in: Pause shows the badge "Paused", the network shows
  `PATCH` 200 and an autosave 201; Resume shows "Running" and the game moves.
- End the session in Mongo (or wait for the idle sweep once it exists), then
  wait for the next heartbeat: the badge shows "Idle" and the resume link
  starts from the last autosave.
- Close the tab mid-game: My Saves shows an autosave from the moment it
  closed. Reopen it with Resume.
- Moves the M4 exit check "close the tab mid-game, lose at most 1 minute"
  forward, and the "Fault tolerance" demo check.
