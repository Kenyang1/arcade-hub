# Build the API with Express and TypeScript instead of ASP.NET Core

- **Status:** in progress
- **Owner:** Kenyang (docs), with Soham on the API and Khoi on jobs and CI
- **Milestone:** M0 Setup, Oct 25–31 (see docs/spec.md)
- **Date:** 2026-10-22
- **PR:** <link once opened>

## Goal
Before any backend code exists, switch the API from ASP.NET Core to Express
with TypeScript, as Soham proposed. When this is done, the spec, CLAUDE.md and
the M0 plan describe one stack, and the whole project is TypeScript. The web
app and the API share one set of contract types, so they can't drift apart.

## Context
No code exists under `api/` yet. The M0 API scaffold step hasn't started, so
the switch costs only docs now. The web scaffold (`web/`, on
`feat/web-scaffold`) is built and checks pass, but it isn't merged yet. Its
`src/lib/types.ts`, `api.ts` and `mocks.ts` already follow the spec's API table
and the ProblemDetails error shape.

Everything the spec promises stays the same: the endpoints, the save-state
flow, the MongoDB data model, the session and save rules, the CronJobs, the
milestones and the demo checklist. Only the language, the libraries and the
commands change.

## Approach
`api/` becomes one Express 5 app in TypeScript. Its routes, its core rules
(`api/src/core/`) and its jobs CLI (`api/src/jobs/`) live in one package, so
the CronJobs reuse the same rules as the endpoints. The official `mongodb`
driver talks to MongoDB, and its `GridFSBucket` stores game and save files.

A pnpm workspace at the repo root holds `web/`, `api/` and a new
`packages/contracts/`. The contracts package defines every request and response
as a zod schema and exports the matching TypeScript types. The API validates
requests with the schemas. The web app imports only the types: `web/src/lib/types.ts`
re-exports them, so pages still import from `types.ts` and don't change.

Errors keep the ProblemDetails JSON body (RFC 9457) that `api.ts` already reads,
so the web side doesn't change when the API lands.

Rejected:
- **Plain JavaScript.** No type checking, and the API couldn't share types with the web app.
- **Two mirrored copies of the types.** `types.ts` plus copies in `api/`, as with the .NET DTOs. The copies could drift.
- **Mongoose.** It adds schemas on top of the zod ones, and GridFS still needs the driver underneath.
- **NestJS or Fastify.** Soham proposed Express, and it's the most familiar choice for all three of us.

## Steps
- [x] **Docs** (Kenyang, this PR): rewrite the stack in `docs/spec.md`,
      `CLAUDE.md`, `README.md`, the M0 plan, `docs/games.md`, `.env.example`,
      `docker-compose.yml`, `.gitignore` and `.gitattributes`.
- [ ] **Workspace** (Kenyang, after `feat/web-scaffold` merges): root
      `pnpm-workspace.yaml` (`web`, `api`, `packages/*`) and root
      `package.json`; move `web/pnpm-lock.yaml` to the root; update the
      `.NET API` row in the M0 plan's Decisions.
- [ ] **Contracts** (Soham + Kenyang, contract PR): `packages/contracts/` with
      zod schemas for every endpoint in the spec's API table, built from
      today's `web/src/lib/types.ts`; `types.ts` becomes a re-export. Changes
      the contract.
- [ ] **API scaffold** (Soham): Express app in `api/` with `GET /api/health`,
      the ProblemDetails error handler, Swagger UI at `/swagger`, the MongoDB
      client, Vitest with one passing test, and the `lint`, `typecheck`,
      `test`, `build` and `dev` scripts.
- [ ] **Jobs CLI** (Khoi): `api/src/jobs/` with `idle-sweep`,
      `prune-autosaves` and `import-games` commands that log "not implemented
      yet", run with `pnpm --dir api jobs <command>`.
- [ ] **CI** (Khoi): `.github/workflows/ci.yml` runs the pnpm checks under
      Commands in `CLAUDE.md`, with a MongoDB service container for API tests.

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Express 5 with TypeScript, run with `tsx` in development and compiled with `tsc` for the image | One language across the repo; Soham's proposal | ASP.NET Core, plain JavaScript, NestJS, Fastify |
| `packages/contracts` with zod schemas, types inferred from them | One source of truth for the contract; the API validates with the same schemas the web app's types come from | Mirrored `types.ts` and DTO copies |
| Official `mongodb` driver with `GridFSBucket` | GridFS is built in; no second schema layer | Mongoose |
| Passwords hashed with `node:crypto` `scrypt`, a random salt per user | Built into Node, salted, no native build step on Windows | `bcrypt` (native build), plain hashes |
| JWT with `jsonwebtoken`, signed with `JWT_SIGNING_KEY` | Most widely used Express option | Session cookies |
| `pino` for structured logs | JSON logs with `sessionId`, `saveId`, `gameId` and `userId` fields | `console.log`, `winston` |
| `multer` for multipart game file uploads, streamed into GridFS | Standard Express middleware for multipart bodies | Base64 in JSON |
| Vitest and `supertest` for tests | Same test runner style as Vite; `supertest` calls the Express app without a network port | Jest, xUnit |
| Swagger UI at `/swagger`, from an OpenAPI document generated from the zod schemas | Keeps the Swagger promise from the spec without writing the document by hand | A hand-written `openapi.yaml` |
| Environment variables in `UPPER_SNAKE_CASE` (`MONGO_URL`, `JWT_SIGNING_KEY`, ...) | Node convention; the ASP.NET `Section__Key` names no longer apply | Keeping `Mongo__ConnectionString` |

## Out of scope
Real endpoints beyond `/api/health`, Docker images and Kubernetes manifests.
Those start in M1, as before. The API table, data model, session and save
rules, milestones and demo checklist don't change.

## Verification
- `rg -i "dotnet|asp\.net|ArcadeHub\.|xunit|__"` over the docs finds nothing
  but this plan's history.
- After the scaffold steps: a fresh clone runs `pnpm install`, then
  `pnpm --dir api dev` serves `/api/health` and `/swagger` on port 5080, and
  `pnpm --dir web dev` proxies `/api` to it.
- CI passes on a PR with the pnpm checks.
