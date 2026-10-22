# CLAUDE.md

Repo context for Claude Code and for humans. Read this before making changes.

## What this is

Arcade Hub is a CS 370 (Fall 2026) project: a web arcade where players browse a
catalog of homebrew retro games, play them in the browser through EmulatorJS,
and save and resume their progress on any device. The games run in the browser.
The backend manages each play session: it serves game files, stores every save,
takes autosaves, detects idle players, and restores progress. Everything runs on
Kubernetes.

Read these before your first change:

- [docs/spec.md](docs/spec.md): what we're building, the milestones, and the
  decisions behind them.
- [docs/plans/](docs/plans/): the plan for each large piece of work, newest last.
- [docs/games.md](docs/games.md): every game we use, with its license link.

The spec is the plan, but the code wins once they disagree: unknowns get
resolved while building. Update `docs/spec.md` in the same PR that changes the
behaviour.

The project is done by **Sunday, Dec 6, 2026**. Code freeze is **Thursday,
Dec 3**. After the freeze, only fixes for the demo checklist in the spec get
merged.

Three people work here:

- **Kenyang** owns `web/`: every page, the player page and EmulatorJS
  integration, and the demo.
- **Soham** owns `api/ArcadeHub.Api` and `api/ArcadeHub.Core`: endpoints,
  MongoDB and GridFS, accounts, sessions and saves.
- **Khoi** owns `infra/`, `api/ArcadeHub.Jobs`, and `.github/`: Docker,
  Kubernetes, the CronJobs, CI, and load and fault tests.

Work outside your folders goes through a PR reviewed by the owner.

## Commands

Every command works in PowerShell and in bash. Where they differ, both are shown.

```bash
# One-time setup
cp .env.example .env                 # PowerShell: Copy-Item .env.example .env
docker compose up -d mongo           # local MongoDB on localhost:27018
pnpm --dir web install
pnpm --dir web emulator:fetch        # downloads the pinned EmulatorJS build into web/public/emulatorjs (gitignored)

# Day to day
dotnet run --project api/ArcadeHub.Api   # http://localhost:5080, Swagger at /swagger
pnpm --dir web dev                       # http://localhost:5173, proxies /api to :5080

# Load games (dry run by default; the folder lives outside the repo)
dotnet run --project api/ArcadeHub.Jobs -- import-games <folder> [--apply]

# Run a job once, locally
dotnet run --project api/ArcadeHub.Jobs -- idle-sweep
dotnet run --project api/ArcadeHub.Jobs -- prune-autosaves

# Checks (CI runs the same ones)
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
dotnet build api/ArcadeHub.sln
dotnet test api/ArcadeHub.sln
npx newman run tests/arcade-hub.postman_collection.json -e tests/local.postman_environment.json
```

Requirements: Node 22 or newer, pnpm 10, the .NET 10 SDK, Docker Desktop with
Kubernetes turned on (or kind), and kubectl.

## Layout

```
web/                        React + TypeScript (Vite) (Kenyang)
  src/pages/                One component per route
  src/components/           Shared components
  src/lib/types.ts          THE contract between pages and the API
  src/lib/api.ts            The only module that calls the API. Returns mocks until an endpoint lands
  src/lib/mocks.ts          Fake data in the shape of types.ts
  src/lib/emulator.ts       The only module that touches EmulatorJS
  public/emulatorjs/        Fetched by `emulator:fetch`. Gitignored, never edit
api/
  ArcadeHub.sln
  ArcadeHub.Api/            ASP.NET Core Web API: controllers, auth, Swagger (Soham)
    Contracts/              Request and response DTOs. Must match web/src/lib/types.ts
  ArcadeHub.Core/           MongoDB models, repositories, session and save rules (Soham)
  ArcadeHub.Jobs/           Console app for CronJobs and imports (Khoi)
  ArcadeHub.Tests/          xUnit tests for Core rules and API endpoints
infra/
  docker/                   Dockerfiles for web (nginx) and api
  k8s/                      Kubernetes manifests, namespace `arcade` (Khoi)
tests/                      Postman collection and environments
docs/
  spec.md                   The build spec
  games.md                  Games we use and their licenses
  plans/                    One plan per large piece of work (see Plans)
  pull_request_template.md  GitHub picks it up from docs/
.github/
  workflows/ci.yml          Lint, typecheck, build, test, Docker build
docker-compose.yml          Local MongoDB only
```

Folders get created as needed. Don't add new top-level folders without updating
this file.

## The data contract

- Pages and components get data **only** from `web/src/lib/api.ts`, and types
  only from `web/src/lib/types.ts`. Never call `fetch` from a page or component.
- Every function in `api.ts` returns mocks until its endpoint exists. Then its
  body changes to a real call; its signature doesn't. Pages don't change when
  the backend lands.
- `types.ts` mirrors the DTOs in `api/ArcadeHub.Api/Contracts/`. Changing either
  one, or an `api.ts` signature, is a contract change. Do it in its own PR, with
  the other side (Kenyang or Soham) as reviewer, and update both sides together.
- Every mutation checks on the server that the caller is signed in, and that a
  session or save belongs to them. Hiding a button is not access control.
- Errors use standard status codes: 400 invalid input, 401 not signed in, 403
  not yours, 404 not found, 409 duplicate title. The body is ASP.NET Core
  `ProblemDetails`, and `api.ts` turns it into a message the page shows.

## What never goes in git

Git history is permanent. Removing a file from it later means rewriting history
and a force-push. That covers **everything git or GitHub stores**: code, tests,
fixtures, docs, plans, commit messages, PR descriptions, comments, and
screenshots.

- **Game files** (ROMs) and **save files**. Games are loaded with
  `import-games` from a folder outside the repo. Only freely distributable
  homebrew games, each listed in `docs/games.md` with its license link. Never a
  commercial game.
- **Secrets.** `.env`, `.env.k8s`, JWT signing keys, and MongoDB passwords stay
  local. `.env.example` lists every variable with a fake value. Kubernetes
  Secrets are created from your local env file, never committed.
- **Real people's account data.** Mocks and seed data use fake usernames like
  `player1`. Screenshots use mock data only.
- The EmulatorJS build in `web/public/emulatorjs/`. It's fetched at a pinned
  version, not committed.

Before every commit, check the staged diff (`git diff --staged`) for any of the
above. If something slips into a pushed commit, don't add a "remove it" commit
on top: tell the team right away so the commit is rewritten before anyone
merges it.

## Auth

- Accounts are username and password. Passwords are hashed with ASP.NET Core's
  `PasswordHasher`. Plain passwords are never stored or logged.
- Sign-in returns a JWT signed with `Jwt__SigningKey`. `api.ts` sends it as
  `Authorization: Bearer <token>`.
- Reading the catalog doesn't need sign-in. Everything else does.
- **Local development:** with `Seed__DevUsers=true` (development only),
  the API creates `dev-player` and `dev-player2` with the password in
  `.env.example` on startup. The setting is ignored outside the Development
  environment.

## Sessions and saves

These rules are the heart of the project. They live in `ArcadeHub.Core`, are
unit-tested, and match `docs/spec.md`.

- Session status is one of `running`, `paused`, `idle`, or `ended`. Only Core
  changes it. Controllers and jobs call Core and never write the field
  themselves.
- The player page sends a heartbeat every **30 s** and uploads an autosave every
  **60 s**. A manual save happens when the player clicks Save.
- The `idle-sweep` job marks a session `idle` after **10 minutes** with no
  heartbeat. Resuming an idle session works exactly like resuming a save.
- The `prune-autosaves` job keeps the **latest 5 autosaves** per player per game.
  Manual saves are never pruned.
- Jobs are safe to run twice: they only change rows that still match their
  condition, and a failed run changes nothing.
- Save files go into GridFS. The `saves` document stores only its id, owner,
  game, kind, and time.

## EmulatorJS

- `web/src/lib/emulator.ts` is the only module that touches the EmulatorJS
  globals (`EJS_*`). Pages call its functions: start, pause, resume, get a save
  state, load a save state, stop.
- EmulatorJS and its cores are served from our own origin under `/emulatorjs/`,
  never from a public CDN. The version is pinned in `web/package.json` and
  fetched by `emulator:fetch`.
- The web nginx image must send the right content types (`application/wasm` for
  `.wasm`). If a game won't load, check the browser console for file-type or
  blocked-request errors first.
- EmulatorJS is GPL-3.0 licensed. Keep its license file next to it.

## Kubernetes

- Everything runs in the `arcade` namespace. Manifests are in `infra/k8s/`.
- Build images, then apply:

  ```bash
  docker build -t arcade-web:dev -f infra/docker/web.Dockerfile .
  docker build -t arcade-api:dev -f infra/docker/api.Dockerfile .
  kubectl apply -R -f infra/k8s/
  ```

  Docker Desktop's cluster sees local images directly. With kind, run
  `kind load docker-image <image>` first.
- Secrets come from your local file, never from git:
  `kubectl -n arcade create secret generic arcade-secrets --from-env-file=.env.k8s`
- MongoDB runs as a StatefulSet with a PersistentVolumeClaim. Deleting its pod
  must never lose data. That's a demo check.
- Every Deployment and CronJob sets CPU and memory requests and limits.
- The API autoscaler needs metrics-server. Docker Desktop and kind don't ship
  it, so install it once per cluster (see `infra/k8s/README.md`).
- CronJobs run `ArcadeHub.Jobs` with `concurrencyPolicy: Forbid`, so two runs of
  the same job never overlap.

## Logging

- Use `ILogger` with structured fields: `sessionId`, `saveId`, `gameId`,
  `userId`. Never usernames, passwords, JWTs, or save-file contents.
- Every job logs one line when it finishes, with counts, for example
  "idle-sweep: 2 sessions marked idle". That's how we check the CronJobs in the
  demo.
- Don't swallow exceptions with a bare `catch`. Let them reach ASP.NET Core's
  error handler, or log them with context.

## Design

Every page works at phone width (400 px). The player page has to be usable with
only a keyboard. Show API errors as plain messages, never a raw status code.

## Branches and CI

- `main` is the only long-lived branch. It must always build and deploy to the
  cluster.
- Branch off `main` as `<type>/<short-slug>` (for example `feat/autosave` or
  `fix/heartbeat-timer`) and open a PR into `main`.
- **Branch protection on `main`:** a PR with one approval, CI must pass, no
  direct or force pushes. (Branch protection on a private repo needs GitHub Pro,
  which is free through the GitHub Student Developer Pack.)
- **CI** (`.github/workflows/ci.yml`) runs the checks under Commands, plus a
  Docker build of both images, on every PR. Run them locally first.
- **Integration Sunday:** each Sunday the team deploys `main` to the cluster and
  runs the current milestone's exit check from the spec.

## Agent orchestration (Claude Code sessions)

The session model (Opus 5.5) plans, orchestrates, and reviews. Implementation
goes to **Sonnet 5.5 subagents** when that's worth it. Always pass
`model: "sonnet"` explicitly, because subagents otherwise inherit the session
model.

The session decides how big the request is first:

- **Small** (a bug fix, a copy change, one component, one endpoint, anything
  that touches a handful of files in one owner's area): do it in the session.
  No plan, no subagents.
- **Large** (a new feature or screen, a new endpoint group, a new job, a
  contract or data-model change, anything that crosses owners, or more than
  about an hour of work): write a plan first (see Plans) and commit it. Then
  implement, either in the session or by handing independent steps to Sonnet
  subagents.

When handing off:

- Give each subagent one self-contained step from the plan: the plan's path,
  the files it owns, the contract it must not change, and how to verify.
  Subagents don't see this conversation.
- Run independent steps in parallel. Steps that touch the same files run one
  after another.
- The session reviews every subagent's diff against the plan before it lands,
  runs the checks under Commands, and fixes what they find.
- Subagents don't push, open PRs, apply anything to a cluster, or create
  Kubernetes Secrets.

## Plans

Any large piece of work starts with a plan in `docs/plans/`, committed
**before** the implementation, as the first commit on the feature branch. The
PR links it.

- **Filename:** `docs/plans/YYYY-MM-DD-<short-slug>.md`, using the date it was
  written. No sequence numbers, since two branches would collide on them.
- **Keep it current.** Tick steps as they land and record decisions under
  Decisions. When the work ships, set Status to `done`. If the approach changes,
  say what changed and why.
- **Size:** one or two screens, for a reviewer to agree on the approach before
  code exists.

Template:

```markdown
# <What this delivers, in plain words>

- **Status:** draft | in progress | done
- **Owner:** <Kenyang | Soham | Khoi>
- **Milestone:** <M0–M6 from docs/spec.md>
- **Date:** YYYY-MM-DD
- **PR:** <link once opened>

## Goal
What's true when this is done, and for whom. Two or three sentences.

## Context
What exists today, the spec section and code it builds on, constraints.

## Approach
The shape of the solution in a paragraph or two. Name the alternatives you rejected.

## Steps
- [ ] Each step is independently reviewable and names the files it touches.
- [ ] Mark steps that change the contract (types.ts, api.ts, Contracts/) or the data model.

## Decisions
| Decision | Why | Rejected |

## Out of scope
What this deliberately doesn't do.

## Verification
Commands, test cases, what to click, and which demo check in the spec this moves forward.
```

## Pull requests

- **Title:** Conventional Commits, `type(scope): summary` in the imperative,
  under about 70 characters. Types: `feat`, `fix`, `refactor`, `chore`, `docs`,
  `test`. Scopes: `catalog`, `sessions`, `saves`, `auth`, `player`, `jobs`,
  `infra`, `ci`, `ui`, `docs`.
- **Size:** one plan step or one coherent change per PR, small enough to review
  in one sitting.
- The owner of the folders it touches reviews it. Contract changes need both
  Kenyang and Soham.

Body (also in `docs/pull_request_template.md`, which GitHub uses for every new PR):

```markdown
## Summary
What changed and why, in two or three sentences. Lead with what a player sees.

## Plan
docs/plans/YYYY-MM-DD-slug.md (step N), or "Small change, no plan".

## Changes
- One bullet per meaningful change, grouped by area.

## Contract and data model
Changes to types.ts, api.ts signatures, Contracts/ DTOs, or MongoDB collections. "None" if none.

## How to test
Steps a reviewer can follow locally or on the cluster, including the tricky cases.

## Screenshots
For UI changes: desktop and phone width. Mock data only.

## Checklist
- [ ] All checks under Commands pass locally
- [ ] No game files, save files, secrets, or real account data in the diff, commits, or this description
- [ ] Plan updated (steps ticked, decisions recorded), if there is one
- [ ] docs/spec.md updated, if behaviour changed
```

PRs written by an agent end with the attribution line Claude Code gives
(`🤖 Generated with [Claude Code](https://claude.com/claude-code)`), and their
commits carry the matching `Co-Authored-By` trailer.
