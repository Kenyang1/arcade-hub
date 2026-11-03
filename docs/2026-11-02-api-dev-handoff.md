# Session handoff: API scaffold and catalog reads

- **Date:** 2026-11-02
- **Branch:** `feat/api-dev`
- **Last commit:** `6279e12` — "Scaffolded the API package per the Express backend plan."
- **Plan:** [2026-10-22-express-backend.md](plans/2026-10-22-express-backend.md), steps 4–5 done, steps 6–7 (jobs CLI, CI) still open
- **Working tree:** clean. `api/dist/` and `node_modules/` are ignored build output.

This file is a session note, not a plan. Delete it once the branch is merged.

## Where things stand

The API package exists and serves the catalog for real. `api/` is an Express 5 app
in TypeScript with a cached MongoDB connection, a pino logger, ProblemDetails
errors, Swagger UI, and 10 Vitest + supertest tests. It builds with `tsc --noEmit`
for type checking and `esbuild` for output.

Players see no change yet: the pages still read mocks. The catalog is empty until
`import-games` exists.

## What works today

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | `{ status, mongo }` for Kubernetes probes. Deliberately not in the contract. |
| `GET /api/games?search=&genre=` | Case-insensitive title search, exact genre match, regex-escaped. |
| `GET /api/games/{id}` | 404 with ProblemDetails when missing. |
| `GET /swagger`, `/swagger.json` | Generated from the zod schemas in `packages/contracts`, so docs can't drift. |

MongoDB being unreachable is a 503 with a readable `detail`, not a 500, and the
server still boots so the state is visible.

## How to run it

```bash
docker compose up -d mongo      # local MongoDB on 27018
pnpm install
pnpm --dir api dev              # http://localhost:5080, Swagger at /swagger
pnpm --dir web dev              # http://localhost:5173, proxies /api to :5080
```

The catalog is empty on a fresh database. To see rows before `import-games` lands,
insert documents into `games` with the shape the plan records: `_id` from Mongo
(the API maps it to the contract's string `id`), plus `title`, `description`,
`genre`, `core`, `romFileId`, `createdAt`.

## Checks, and what they showed

- `pnpm --dir api lint`, `typecheck`, `build`: pass.
- `pnpm --dir api test`: 10 tests pass against a real MongoDB.
- `web` lint, typecheck, build and `packages/contracts` typecheck: still pass after
  the lockfile change.
- The built `dist/server.js` (not just the dev runner) served seeded data, returned
  `application/problem+json` on a 404, and shut down cleanly on SIGTERM.
- Docker was not usable in the agent's environment, so the tests ran against a
  temporary local `mongod` bound to `127.0.0.1:27018`. The `docker compose up -d
  mongo` path itself is unverified here; the only thing the tests need from it is a
  reachable MongoDB at `mongodb://localhost:27018`.

## Decisions worth knowing (all in the plan's Decisions table)

- **Build with esbuild after `tsc --noEmit`.** `packages/contracts` ships TypeScript
  source. `tsc` can't emit a file outside `rootDir`, and Node won't import a `.ts`
  from `node_modules`, so a plain `tsc` build produces a `dist/` that can't start.
- **Keep MongoDB's `_id`.** The API maps it to the contract's string `id`, so
  `import-games` can write plain documents and nothing keeps two ids in sync.
- **`vite` pinned to 8.3.4 inside `api/`.** `vitest` needs it, and pnpm's 14-day
  `minimumReleaseAge` refuses 8.3.5. Test-only, so it can't clash with the web app.

## Next steps, smallest first

1. **Point the catalog at the API.** `listGames` and `getGame` in
   `web/src/lib/api.ts` still filter mocks; their bodies become `request()` calls.
   Signatures don't change, and pages don't change either.
2. **`GET /api/games/{id}/file`.** GridFS stream, correct content type. The Play
   page already fetches this URL through `downloadGameFile`.
3. **`import-games`.** The job that fills the catalog, writing the document shape
   above. Until it lands the app demos empty.
4. **Games create/update/delete** (M2), with `multer` streaming uploads into GridFS
   and 409 on a duplicate title.
5. **Sessions, saves, auth.** Nothing exists server-side yet.
6. **Infra and CI.** Dockerfiles, the Kubernetes manifests (only
   `infra/k8s/namespace.yaml` exists), and turning the API steps back on in
   `.github/workflows/ci.yml` with a MongoDB service container.
7. **Postman collection.** `tests/arcade-hub.postman_collection.json` doesn't exist,
   but the commented-out Newman line in CI already references it.
8. **Move the placeholder CronJobs.** `api/src/jobs/cronjobs.yaml` sits outside
   `infra/k8s/`, runs `busybox echo`, and its `prune-autosaves` schedule is weekly.

## Paste-ready PR description

**Title:** `feat(catalog): scaffold the Express API and serve the catalog`

````markdown
## Summary
The catalog now has a real backend: `GET /api/games` and `GET /api/games/{id}` read
games from MongoDB and answer with the contract's `Game` shape, so the web app can
stop relying on mocks as soon as its `api.ts` functions switch over. This also lands
the Express scaffold the API plan called for: health endpoint, ProblemDetails error
handler, Swagger UI, MongoDB client and a test suite. Players see no change yet,
because the pages still read mocks and the catalog is empty until games are imported.

## Plan
docs/plans/2026-10-22-express-backend.md, steps 4–5 ("API scaffold", "Catalog
reads"). Both are ticked, and its Decisions table records the build, the id mapping
and the `vite` pin.

## Changes

**API (`api/`)**
- New package: `dev`, `start`, `build`, `lint`, `typecheck`, `test` scripts, plus
  `tsconfig.json` (same strictness as `web/`), `.oxlintrc.json` and `vitest.config.ts`.
- `src/app.ts`, `src/server.ts`: app builder and entry point on port 5080, with
  graceful SIGINT/SIGTERM shutdown.
- `src/config.ts` loads the root `.env`; `src/logger.ts` is pino, silent in tests.
- `src/core/mongo.ts`: one cached connection, with failed attempts retried on the
  next request instead of cached until restart.
- `src/core/games.ts`: list, search, filter and find-by-id rules.
- `src/http/problem.ts`: `HttpError`, the ProblemDetails writer (RFC 9457,
  `application/problem+json`), the 404 handler and the error handler.
- `src/routes/games.ts`, `src/routes/health.ts`.
- `src/openapi.ts`: OpenAPI 3.1 document generated from the contract's zod schemas
  with `z.toJSONSchema`, served at `/swagger` and `/swagger.json`.
- `test/`: 10 Vitest + supertest tests in 2 files, against a real MongoDB.

**Docs**
- Express backend plan updated as described above.

**Not in this PR:** `GET /api/games/{id}/file` (needs GridFS and real ROMs),
`import-games` (owned by the infrastructure workstream), games create/update/delete
(M2), sessions, saves, auth, Dockerfiles and Kubernetes manifests.

## Contract and data model
No change to `packages/contracts` and no `api.ts` signature changes: the endpoints
use the existing `Game`, `GameQuery` and `ProblemDetails` schemas.

Data model, as recorded in the plan: `games` documents keep MongoDB's `_id` (the API
maps it to the contract's string `id`) and hold `title`, `description`, `genre`,
`core`, `romFileId`, `createdAt`. `import-games` should write exactly this shape.

Two API-side notes:
- `GET /api/health` returns `{ "status": "ok", "mongo": "up" | "down" }`. It is for
  Kubernetes probes and is deliberately not in the contract.
- MongoDB being unreachable is a 503 with a readable detail rather than a 500, and
  the server still boots so the state is visible.

## How to test
```bash
docker compose up -d mongo
pnpm install
pnpm --dir api dev            # http://localhost:5080, Swagger at /swagger
```

Then:
- `curl localhost:5080/api/health` returns `mongo: "up"`.
- `curl "localhost:5080/api/games?search=..."` returns `[]` on an empty database and
  the matching games after you insert some.
- `curl -i localhost:5080/api/games/nope` returns 404 with
  `Content-Type: application/problem+json` and a readable `detail`.
- `curl "localhost:5080/api/games?search=["` is a 400, not a regex error, because
  the search term is escaped.
- `pnpm --dir api test` runs 10 tests against a MongoDB at `localhost:27018`
  (database `arcadehub_test`).

## Screenshots
None: no UI change.

## Checklist
- [x] All checks under Commands in CLAUDE.md pass locally
      (`api`: lint, typecheck, test, build; `web` and `contracts`: unchanged but
      re-run after the lockfile change)
- [x] No game files, save files, secrets, or real account data in the diff, commits,
      or this description
- [x] Plan updated (steps ticked, decisions recorded)
- [x] docs/spec.md updated, if behaviour changed — not needed: the catalog endpoints
      are already listed under M1, and the stack section already says Express + MongoDB

🤖 Generated with [Freebuff](https://freebuff.com)
````

## Environment notes

- A temporary `mongod` from `/tmp` is still listening on `127.0.0.1:27018` (pid
  39014 at the end of the session). It is not part of the repo and not managed by
  `docker compose`. `kill 39014` frees the port; on a machine where Docker works,
  `docker compose up -d mongo` replaces it.
- The agent's environment had no usable Docker socket, which is why the compose path
  went unverified.
