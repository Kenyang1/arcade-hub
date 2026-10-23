# Arcade Hub — Project Spec & Milestone Roadmap

Last updated: Oct 22, 2026 · Owner: Kenyang

## Overview

Three developers ship Arcade Hub in six weeks, from Oct 25, 2026 to Dec 6, 2026. The plan builds one thin working slice first, then adds the Kubernetes-managed game features one layer at a time, so there is always something to demo.

**What we are building:** a React arcade hub backed by an Express REST API and MongoDB, all on Kubernetes. The web app and the API are both TypeScript and share one set of contract types. Games run in the player's browser through EmulatorJS (RetroArch's emulator cores, compiled to run in a web page), so there is no streaming lag. The backend manages each play session: it serves the game files, stores every save, takes autosaves, detects idle players and restores progress on any device.

**Assumptions** (change these if they are wrong):

- Everything is finished by Sunday, Dec 6. Code freeze is Thursday, Dec 3.
- Each developer has about 8–10 hours a week. Thanksgiving week (Nov 23–29) is planned as a lighter week.
- We develop on a local Kubernetes cluster (Docker Desktop or kind) and only move to a cloud cluster if the class requires it.
- The repo's working rules (ownership, the data contract, plans, PRs, what never goes in git) live in `CLAUDE.md` at the repo root. Once code and this spec disagree, the code wins and the spec is updated in the same PR.
- Roles below are a starting split by skill area. Swap names freely; the workstreams stay the same.

## Team roles

Each developer owns one workstream end to end, so nobody waits on anyone else for day-to-day work. The workstreams meet at the agreed contracts (next section), and those get settled in week 1.

| Workstream | Owner | Owns | Main folders |
| --- | --- | --- | --- |
| Frontend & integration | Kenyang | React hub, catalog and search pages, game player page with EmulatorJS (load game, save, pause, autosave, heartbeat), sign-in screens, demo and presentation, weekly integration check | `web/` |
| Backend API | Soham | Express API in TypeScript, MongoDB and GridFS, accounts and JWT sign-in, session and save endpoints, Swagger, Postman tests | `api/` (except `api/src/jobs/`) |
| Infrastructure | Khoi | Dockerfiles, Kubernetes manifests, self-hosting EmulatorJS and game files with the right headers, the CronJobs (idle sweep, autosave pruning, backups), API autoscaling, CI, load and fault tests | `infra/`, `api/src/jobs/`, `.github/` |

Kenyang also acts as project coordinator: runs the check-ins, keeps the board current and calls the go/no-go decisions.

## Tech stack

Changed Oct 22, 2026: the API moved from ASP.NET Core to Express before any API code existed, as Soham proposed. The decisions and the rejected options are in `docs/plans/2026-10-22-express-backend.md`.

| Part | Choice |
| --- | --- |
| Web app | React and TypeScript on Vite, React Router, EmulatorJS served from our own origin |
| API | Express 5 and TypeScript on Node 22 |
| Contract | `packages/contracts`: zod schemas for every request and response, with TypeScript types inferred from them. The API validates with the schemas; the web app imports the types |
| Database | MongoDB 8 through the official `mongodb` driver; game and save files in GridFS (`GridFSBucket`) |
| Auth | Passwords hashed with `scrypt` from `node:crypto`, a random salt per user; JWT sign-in with `jsonwebtoken` |
| Errors | ProblemDetails JSON bodies (RFC 9457) with standard status codes |
| Logs | `pino`, structured JSON |
| Tests | Vitest and `supertest`; Postman collection run with Newman |
| Jobs | A CLI in `api/src/jobs/`, run by Kubernetes CronJobs |
| Repo | One pnpm workspace: `web/`, `api/`, `packages/contracts/` |

## Contracts between workstreams

Three agreements let everyone build in parallel: the public REST API, the save-state flow between the player page and the API, and the MongoDB data model. Lock all three by Oct 31. After that, any change needs a heads-up to the other two developers.

### Public REST API (React → Express)

Owned by Soham, used by Kenyang. Every request and response body is a zod schema in `packages/contracts`, so both sides compile against the same types. Until the real endpoints exist, Kenyang builds against mock data with the same shape.

| Method | Endpoint | Purpose | Milestone |
| --- | --- | --- | --- |
| GET | /api/games?search=&genre= | List or search the catalog | M1 |
| GET | /api/games/{id} | One game's details | M1 |
| POST | /api/games | Add a game (details + game file) | M1 |
| PUT | /api/games/{id} | Edit a game | M1 |
| DELETE | /api/games/{id} | Remove a game | M1 |
| GET | /api/games/{id}/file | Download the game file for EmulatorJS | M2 |
| POST | /api/sessions | Start a game, optionally from a save; returns session ID, game file URL, emulator core and save file URL | M2 |
| GET | /api/sessions/{id} | Session status | M2 |
| POST | /api/sessions/{id}/heartbeat | Browser reports "still playing" every 30 s | M2 |
| DELETE | /api/sessions/{id} | End a session | M2 |
| POST | /api/auth/register, /api/auth/login | Accounts and sign-in | M3 |
| POST | /api/sessions/{id}/saves | Upload a save state (manual or autosave) | M3 |
| GET | /api/saves?gameId= | List the player's saves | M3 |
| GET | /api/saves/{id}/file | Download a save state to resume | M3 |
| PATCH | /api/sessions/{id} | Pause or resume | M4 |

### Save-state flow (player page → API)

Owned by Kenyang and Soham together. EmulatorJS produces the save state in the browser; the player page sends it to the API so the backend owns every save.

| When | Player page does | API call |
| --- | --- | --- |
| Game starts | Load EmulatorJS with the core and game file; if resuming, load the save file too | POST /api/sessions |
| Every 30 s | Send a heartbeat | POST /api/sessions/{id}/heartbeat |
| Every 60 s | Take a save state from EmulatorJS and upload it as an autosave | POST /api/sessions/{id}/saves |
| Player clicks Save | Upload a manual save | POST /api/sessions/{id}/saves |
| Player clicks Pause or Resume | Pause or resume EmulatorJS and report it | PATCH /api/sessions/{id} |
| Tab closes | Try one last autosave, then end the session | POST saves, then DELETE /api/sessions/{id} |

Kubernetes CronJobs (Khoi) run the jobs CLI in `api/src/jobs/`. `idle-sweep` runs every minute and marks sessions with no heartbeat for 10 minutes as idle. `prune-autosaves` keeps only the latest five autosaves per player per game.

### MongoDB data model

Owned by Soham.

| Collection | Key fields |
| --- | --- |
| games | id, title, description, genre, romFileId (GridFS), core (which emulator core, e.g. nes), createdAt |
| users | id, username, passwordHash, createdAt |
| sessions | id, userId, gameId, status (running / paused / idle / ended), lastHeartbeatAt, lastAutosaveId |
| saves | id, userId, gameId, stateFileId (GridFS), kind (manual / autosave), createdAt |

## Milestone roadmap

Seven one-week milestones run back to back from Oct 25. The first playable game is due Nov 15, leaving three weeks for the Kubernetes-managed features and testing.

| Milestone | Dates | Decision point |
| --- | --- | --- |
| M0 Setup | Oct 25 – Oct 31 | Contracts locked Oct 31 |
| M1 Catalog slice | Nov 1 – Nov 8 | |
| M2 First playable game | Nov 9 – Nov 15 | **Save-state check Nov 15** |
| M3 Save and resume | Nov 16 – Nov 22 | |
| M4 Managed play | Nov 23 – Nov 29 (Thanksgiving) | |
| M5 Hardening | Nov 30 – Dec 3 | **Code freeze Dec 3** |
| M6 Demo and report | Dec 4 – Dec 6 | **Project complete Dec 6** |

Watch the Nov 15 save-state check most closely: if saves can't travel from EmulatorJS to the API and back, M3 and M4 are at risk.

## Task breakdown

Each row is one milestone of about one week. A milestone is done only when its exit check passes on the team's Kubernetes cluster, not just on one laptop. Kenyang builds every page against mocks first (see the data contract in `CLAUDE.md`), so frontend work never waits on the API.

| Milestone | Kenyang (frontend) | Soham (API) | Khoi (infrastructure) | Exit check |
| --- | --- | --- | --- | --- |
| M0 Setup, Oct 25–31 | Create repo and project board; commit `CLAUDE.md`, `docs/spec.md`, the plan template and PR template; scaffold React app with `types.ts`, `api.ts` and mocks; set up the pnpm workspace; run EmulatorJS with one homebrew game in a plain page | Scaffold the Express API in TypeScript with Swagger and a health endpoint; write the data model and the contracts package with Kenyang; local MongoDB in Docker | Set up local Kubernetes for all three; CI workflow; jobs CLI stub; with Kenyang, confirm an EmulatorJS save state exports and loads back | All three run the stack locally; CI passes; a homebrew game plays in the browser; contracts agreed |
| M1 Catalog slice, Nov 1–8 | Catalog, search, add, edit and delete pages, first on mocks, then switched to the real API | Games CRUD + search on MongoDB; game file upload to GridFS; validation and status codes | Dockerfiles for web and API; Deployments, Services, ConfigMap, Secret, MongoDB StatefulSet with PVC | Add, search, edit and delete a game in the browser against the cluster |
| M2 First playable game, Nov 9–15 | Player page loads EmulatorJS with the core and game file from the API; heartbeat; Start and End buttons | Session endpoints; game file download; heartbeat tracking | Self-host EmulatorJS and its cores in the cluster with correct content types; autoscaler for the API | Click Play, game runs within 10 s using files from the cluster. **Save-state check Nov 15:** a save uploads to the API and loads back in a fresh tab |
| M3 Save & resume, Nov 16–22 | Sign-in and register screens; Save button; autosave every 60 s; My Saves list with Resume | Accounts with hashed passwords and JWT; save upload and download through GridFS; start-from-save | Raise upload size limits for save files; test resume across two computers | Save, close the tab, resume on another computer from the same spot |
| M4 Managed play, Nov 23–29 (Thanksgiving) | Pause/Resume button; session status badges; last autosave when the tab closes | PATCH pause/resume; the Core methods the jobs call | Idle-sweep and autosave-pruning CronJobs; CPU and memory limits | Close the tab mid-game, lose at most 1 minute; idle session marked idle after 10 min; delete an API pod mid-game and autosaves keep landing |
| M5 Hardening, Nov 30–Dec 3 | Phone-width pass; UI bug fixes; record backup demo video | Postman collection for every endpoint; fix API bugs | Load test (20 clients), autoscaling 1→3 API replicas, fault tests; MongoDB backup CronJob if time allows | Every demo check in the last section passes. **Code freeze Dec 3** |
| M6 Demo & report, Dec 4–6 | Lead slides and live demo rehearsal | Write API and data sections of the report | Write infrastructure section; final cluster reset before demo | Everything done by Dec 6 |

## How we work

The full rules live in `CLAUDE.md` at the repo root. Read it before your first change. The short version:

- **Repo:** one GitHub repo and pnpm workspace with `web/`, `api/`, `packages/contracts/`, `infra/` and `docs/`. `main` must always build and deploy.
- **Data contract:** pages get data only from `web/src/lib/api.ts`, which returns mocks until the real endpoint lands. Changing `packages/contracts`, `types.ts`, or an `api.ts` signature is a contract change: its own PR, reviewed by the other side.
- **Plans:** any large piece of work (a new feature, screen, endpoint group, job or schema change) starts with a one-to-two-screen plan in `docs/plans/YYYY-MM-DD-slug.md`, committed first on the branch.
- **Branches and PRs:** branch `type/slug` off `main`, PR back into `main`, one approval from a teammate, CI green. Kenyang, as team lead, can merge without an approval. PR titles follow Conventional Commits, e.g. `feat(saves): upload autosaves every 60 s`.
- **Never in git:** game files, save files, secrets and real classmates' account data. Game files are loaded with the `import-games` job from a folder outside the repo.
- **Board:** GitHub Projects with To do, In progress, In review and Done. Every task in the breakdown is a card with an owner.
- **Check-ins:** 15 minutes on Monday and Thursday: what you finished, what's next, what's blocking you.
- **Integration Sunday:** each Sunday, deploy `main` to the cluster and run that milestone's exit check together. A failing check becomes Monday's top task.
- **Definition of done:** merged, runs on the cluster, plan ticked, and `docs/spec.md` updated if behaviour changed.

## Risks and fallbacks

The two biggest risks are the six-week timeline and getting save states out of EmulatorJS and back in through our API. The save-state check on Nov 15 leaves three weeks to recover, and the cut list below says what goes first.

| Risk | Early warning | Fallback | Owner |
| --- | --- | --- | --- |
| Save states can't be pulled out of EmulatorJS cleanly | M0 spike fails | Use EmulatorJS's built-in save-state hooks; worst case, upload only when the player clicks Save | Kenyang |
| Professor expects games to run inside Kubernetes | Feedback on the updated proposal | Email the professor: games run in the browser to avoid lag; Kubernetes manages sessions, autosaves, idle detection and resume | Kenyang |
| Emulator or game files fail to load from the cluster | Browser console errors about file types or blocked requests | Serve EmulatorJS and game files ourselves through nginx with correct content types instead of a public CDN | Khoi |
| Laptops struggle to run the cluster | Pods stuck in Pending | Run fewer replicas locally; run the final demo on the most powerful laptop or a class cloud account | Khoi |
| Contract drift between workstreams | Integration Sunday fails | Any contract change is posted in the team chat before merge | All |
| Thanksgiving week slips | M4 check fails Nov 29 | Move autosave pruning to M5; autosave and idle detection stay | Kenyang |
| Using games we can't legally share | Any commercial game file in the repo | Only freely distributable homebrew games; keep a list with license links in `docs/games.md` | Kenyang |

**If we fall behind, cut in this order:** search filters by genre → edit game (PUT) → MongoDB backup CronJob → pause/resume reporting. Never cut save/resume, autosave or idle detection: they are how Kubernetes manages the game.

## Final demo checklist

Each box is one non-functional requirement, proven live. Tick them off during M5. All nine must pass by the code freeze on Dec 3.

- [ ] **Fault tolerance:** close the browser tab mid-game, reopen, and lose at most 1 minute of progress (Kenyang)
- [ ] **API failover:** with 3 API replicas, delete one pod mid-game; autosaves keep landing with no error shown (Khoi)
- [ ] **Idle detection:** stop playing for 10 minutes; the CronJob marks the session idle; resume still works (Khoi)
- [ ] **Durability:** create saves, delete the MongoDB pod, resume every save (Soham)
- [ ] **Portability:** save on one computer, resume on another (Kenyang)
- [ ] **Start time:** 10 starts and 10 resumes, each playable within 10 s (Kenyang)
- [ ] **Scalability:** during a 20-client load test, the API scales from 1 to 3 replicas with no errors (Khoi)
- [ ] **RESTful design:** Postman collection passes on every endpoint (Soham)
- [ ] **Security:** credentials only in Kubernetes Secrets; passwords stored as salted hashes (Soham)
