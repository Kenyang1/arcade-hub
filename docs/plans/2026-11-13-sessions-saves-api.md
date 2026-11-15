# Sessions and save states over the API

- **Status:** in progress
- **Owner:** Soham
- **Milestone:** M2 Catalog management and sessions (save-state check Nov 15)
- **Date:** 2026-11-13
- **PR:** <link once opened>

## Goal
The player page can start a session, keep it alive, end it, upload a save state
and download it again. When this is done the Nov 15 check can pass: a save
uploads to the API and loads back in a fresh tab, and the web side
(`feat/play-page-saves`) has real endpoints instead of mocks.

## Context
`GET /api/games*` and the game file endpoint read MongoDB and GridFS
(`api/src/core/games.ts`). The contract already defines `Session`, `Save`,
`StartSessionRequest`, `StartSessionResponse` and `SaveKind`, and the player page
sends `POST /api/sessions` with an optional `saveId`, a heartbeat every 30 s, a
multipart save upload, and a `GET /api/saves/{id}/file` download. Nothing in
`api/` reads a user yet: sign-in is M3, and `api.ts` still mocks it. The
`idle-sweep` and `prune-autosaves` jobs are stubs (Khoi's area).

## Approach
Rules live in `api/src/core/sessions.ts` and `api/src/core/saves.ts`, which are
the only modules that write a session's `status`, matching CLAUDE.md. Save bytes
go into a `saveStates` GridFS bucket, and the `saves` document keeps only the
file id, owner, game, kind and time.

Because every mutation must know who is calling, `api/src/core/auth.ts` resolves
the player from the bearer token (HS256, `JWT_SIGNING_KEY`). Sign-in itself
(register, login, scrypt hashing on the public endpoints) is still M3, so a
non-production server treats a request with no token as one stand-in account,
and production answers 401. That is written into `docs/spec.md` so the spec and
the code agree; when M3 lands, only `currentUser` changes.

Rejected: leaving these endpoints open to everyone until M3 — ownership checks
(session and save belong to the caller) are the point of the feature. Rejected:
shipping register and login now — that is a separate M3 slice, and the web side
still mocks sign-in.

## Steps
- [x] `packages/contracts`: `SaveUploadFieldsSchema` (the `kind` field) and
      `SAVE_STATE_FIELD = 'state'`. **Contract change**, reviewed with Kenyang.
- [x] `api/src/core/auth.ts`: scrypt hashing, token signing and verification,
      `currentUser`, `SEED_DEV_USERS` seeding.
- [x] `api/src/core/sessions.ts`: start (optionally from a save), heartbeat, end,
      `lastAutosaveId`.
- [x] `api/src/core/saves.ts`: multipart bytes to GridFS, ownership, download stream.
- [x] `api/src/routes/sessions.ts`, `api/src/routes/saves.ts`, mounted in `app.ts`;
      multer (`memoryStorage`, capped by `maxSaveStateBytes`) and its errors turned
      into ProblemDetails in `http/problem.ts`.
- [x] `api/src/openapi.ts`: the five paths, a bearer security scheme, the schemas.
- [x] `api/test/sessions.test.ts`, `api/test/saves.test.ts`.
- [x] `GET /api/sessions/{id}`, `GET /api/saves?gameId=` and `PATCH /api/sessions/{id}`
      (pause/resume), plus `SaveQuerySchema` in the contract.
- [ ] Autosave pruning and idle sweeping (Khoi), and `api.ts` real calls (Kenyang).

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Save upload is multipart: `kind` field, `state` file part | EmulatorJS hands the page a `Uint8Array`; a file part streams it without base64 inflation, and it matches the game-file upload | JSON with a base64 `state` (33% bigger, needs a bigger body limit) |
| An idle or ended session refuses a heartbeat with 409 | Spec: resuming an idle session works like resuming a save, so a live session is never revived in place | Quietly flipping an idle session back to running |
| Ending a session twice answers 204 | The tab-close handler can fire more than once | 409 on the second call |
| Save states live in their own GridFS bucket (`saveStates`) | Keeps game files and player data separable for backup and pruning | Reusing `gameFiles` |
| A token-less request plays as `dev-player` outside production | Otherwise no endpoint could be used before M3, and the Nov 15 check would slip | Open endpoints, or shipping M3 auth early |
| Autosaves only update `lastAutosaveId` | The 5-per-player-per-game rule belongs to `prune-autosaves`, so it is enforced in one place | Pruning inside the upload handler |
| Pause and resume are the only status moves `PATCH` allows, and only between `running` and `paused` | Matches the player page's one button and keeps resuming an idle session equal to resuming a save | Accepting any `SessionStatus`, which would let a client end or idle a session through `PATCH` |
| Asking for the status a session already has answers 200 and changes nothing | A double-clicked Pause button is not an error | 409 on a repeated request |

## Out of scope
Register and login (M3), the jobs and their CronJobs (Khoi), game
create/edit/delete, real calls in `web/src/lib/api.ts` (Kenyang's
`feat/play-page-saves`).

## Verification
- `pnpm --dir packages/contracts typecheck`, `pnpm --dir api lint`,
  `pnpm --dir api typecheck`, `pnpm --dir api test`, `pnpm --dir api build` pass.
- With MongoDB and an imported game: `POST /api/sessions` returns 201 with the
  game file URL and `saveFileUrl: null`; the heartbeat and `DELETE` answer 204;
  a multipart upload returns the save; `GET /api/saves/{id}/file` returns the
  same bytes. An unknown id is 404, another player's session or save is 403, a
  save on an ended session is 409, all as ProblemDetails.
- Moves forward the M2 exit check "a save uploads to the API and loads back in a
  fresh tab" (the web half is `docs/plans/2026-11-12-play-page-sessions-and-saves.md`).
