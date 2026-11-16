# Real sign-in, My Saves from the API, and autosave every 60 s

- **Status:** in progress
- **Owner:** Kenyang
- **Milestone:** M3 Save and resume (exit check Sun Nov 22)
- **Date:** 2026-11-15
- **PR:** <link once opened>

## Goal
A player creates an account or signs in, plays, and the Play page autosaves
every 60 s on top of manual saves. On another computer they sign in, open My
Saves, see the same saves from the API and click Resume to land at the same
spot. This is the web half of the Nov 22 exit check: "sign in, save, close the
tab, resume on another computer from the same spot".

## Context
- The Sign in and My Saves screens exist, but `login`, `register`, `listSaves`
  and `getSession` in `web/src/lib/api.ts` still return mocks.
- On `main` (PR #18): `GET /api/saves?gameId=`, `GET /api/sessions/{id}`, the
  save upload with `kind: 'autosave'`, and bearer-token checks
  (`api/src/core/auth.ts`). A request with no token plays as one stand-in
  account only while `ALLOW_STAND_IN_USER` is set.
- Not on `main` yet (Soham): `POST /api/auth/register` and `POST /api/auth/login`.
  Their shapes are already in `packages/contracts`: `Credentials` in,
  `AuthResponse` (`token`, `user`) out.
- The Play page (PR #16) already starts a session, heartbeats every 30 s and
  uploads manual saves.
- Bug on `main` today: a mock sign-in stores a fake token, and the API answers
  every session call that carries it with 401.

## Approach
`api.ts` switches `login`, `register`, `listSaves` and `getSession` to real
calls; no signature changes, so no contract change. Until Soham's auth routes
land, a 404 from them turns into "Accounts aren't switched on on the server
yet", and the rest of the app keeps working through the stand-in account.

Auth state gets one small store in `api.ts` (`onAuthChange`) plus a
`useCurrentUser` hook, so the top bar, Sign in and My Saves update the moment
someone signs in or out, also in other tabs (the `storage` event). When a
request that carried a token comes back 401, `api.ts` drops the token and says
"Your sign-in ran out. Please sign in again." That also clears the fake mock
token above.

Autosave lives in a small timer module, `web/src/lib/autosave.ts`, so it can be
unit-tested without a browser: every 60 s it asks the page whether a save may
run (session live, game running, not paused, no save already uploading), and
then uploads `emulator.getSaveState()` as `kind: 'autosave'`. A failed autosave
is shown as a quiet note and retried on the next tick, never as a page error.
The page shows "Autosaved at 7:42:10 PM".

Rejected: a `setInterval` written straight into `PlayPage.tsx` (can't be tested
without EmulatorJS); autosaving from the heartbeat (heartbeats must stay tiny
and every 30 s, autosaves every 60 s, per CLAUDE.md); keeping the auth mocks
until Soham merges (the Nov 22 check needs real accounts, and the 404 message
keeps `main` usable meanwhile).

## Steps
- [x] `docs/plans/`: this plan (first commit).
- [x] `api.ts`: real `login`, `register` (POST `/api/auth/*`), `listSaves`
  (GET `/api/saves`), `getSession` (GET `/api/sessions/{id}`); auth-change store;
  401 with a token signs out. **Assumes** Soham's routes answer 401 for a wrong
  username or password, 409 for a taken username, 400 with `errors` for bad
  input, and 201 or 200 with `AuthResponse`.
- [x] `lib/useCurrentUser.ts`; `Layout.tsx`, `SignInPage.tsx`, `MySavesPage.tsx`
  use it. Sign in returns to `?next=` (for example from My Saves).
- [x] `MySavesPage.tsx`: real list, signed-out and expired-sign-in states.
- [x] `lib/autosave.ts` + `PlayPage.tsx`: autosave every 60 s; a "Sign in to keep
  your saves" link when the API says the player isn't signed in.
- [x] Web unit tests with Vitest (`pnpm --dir web test`): autosave timer, auth
  calls, 401 sign-out, saves query string.

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| No contract change | `Credentials` and `AuthResponse` already exist; Soham builds to them | A new auth schema |
| 404 from auth routes means "not switched on yet" | `main` stays usable before Soham's routes land | Keeping mocks |
| Drop the token on any 401 that carried one | Expired or fake tokens otherwise block every save | Retrying silently as the stand-in user |
| Autosave skips while a save is uploading | Two uploads of the same moment waste GridFS space | Queuing them |
| Add Vitest to `web/` | The timer and auth rules need tests; the API already uses Vitest | Testing only by hand |
| `?next=` only accepts a path in this app | A link can't send a player to another site after they type their password | Any URL |
| Auth state in localStorage plus a change event | Every tab, a reload, and the top bar agree on who's signed in | React context only, which other tabs can't see |

## Out of scope
Soham's `/api/auth/*` routes; the last autosave on tab close and Pause/Resume
(M4, Nov 29); AI labels on saves (PR #22, PR #26); adding `pnpm --dir web test`
to CI (`.github/` is Khoi's, so it's a note for him); removing Export and Load
state.

## Verification
- `pnpm --dir web lint`, `typecheck`, `test` and `build` pass (22 web tests).
- Not yet clicked through in a browser against the real API: Soham's auth routes
  aren't on `main`, and the autosave needs a running game.
- Before Soham's routes: Create account shows "Accounts aren't switched on on
  the server yet"; playing and saving still work through the stand-in account.
- After Soham's routes: create an account, play for over a minute, and the page
  shows "Autosaved at …". My Saves lists the autosave and any manual save.
  In another browser (or computer), sign in, open My Saves, click Resume: the
  game starts at the same spot.
- Sign out in one tab: the top bar in the other tab says Sign in.
- Moves forward the M3 exit check in `docs/spec.md`.
