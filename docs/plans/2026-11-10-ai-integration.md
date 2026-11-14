# Add AI to Arcade Hub: save labels, a game guide, and a score reader

- **Status:** draft
- **Owner:** Kenyang (Soham reviews `api/` and the contract; Khoi adds the key to the Kubernetes Secret)
- **Milestone:** M3 to M5 from docs/spec.md (research during M2)
- **Date:** 2026-11-10
- **PR:** <link once opened>

## Goal
Our professor asked us to add AI to Arcade Hub. When this is done, a player
sees three things. Each save in My Saves has a label that an AI vision model
reads from the game screen, such as "Level 12, 0:45 left". The Play page has a
guide that answers "how do I play?" from the game's own readme and the current
screen. If time allows, the player's best level is read from the screen and
shown on a leaderboard. Labels and the guide ship first. The score reader is a
stretch goal.

## Context
- Saves are the core of the project (spec, "Sessions and saves"). The save
  upload lands in M2 or M3, so labels can build on it. `SaveSchema` in
  `packages/contracts` stores id, owner, game, kind and time today.
- `web/src/lib/emulator.ts` already exports `start`, `pause`, `resume`,
  `getSaveState`, `loadSaveState` and `stop`. It has no way to capture a frame
  yet.
- The catalog has one game, Bomb Sweeper (`docs/games.md`). Its readme
  describes 99 levels and a timer. It has no score, and it has a hidden
  level-select cheat.
- No leaderboard exists in the spec or the code.
- Game readmes are in the import folder next to the game files. They aren't
  stored in MongoDB yet.
- Every page goes through `web/src/lib/api.ts`. The browser must never hold an
  AI key, so every AI call is made by the API.

## Approach
Use one pipeline for all three features:

1. `emulator.ts` captures the current frame from the EmulatorJS canvas as a PNG.
2. `api.ts` sends it to the API, tied to a session the API issued.
3. A new module, `api/src/core/ai.ts`, upscales the frame (NES frames are
   256x240), calls the vision model, and asks for structured output.
4. A zod schema in `packages/contracts` validates the answer before anything
   uses it.

Only `ai.ts` knows which provider is used. Switching between a free tier and a
paid one means changing that one file.

Labels are generated when a save uploads. A failed call never fails the save:
the label stays empty and the card shows the save's time, as it does today. The
guide sends the readme text and an optional frame, and returns plain text. The
score reader uses per-game rules from `games.json` (what to read: score, level
or time, and whether higher is better). It runs only on frames the Play page
captured during a session the caller owns.

**Rejected:**
- Calling the AI API from the browser: the key would leak, and it breaks the
  data contract.
- Letting players upload their own screenshots for scores: they are trivial to
  fake.
- Reading scores from emulator memory: more accurate, but it isn't AI, which is
  what the professor asked for. It's noted as the honest limit in the report.
- Recommendations: with one game in the catalog, they have nothing to
  recommend.

## Steps
- [ ] **Research (M2, by Nov 15).** Create a free-tier key in Google AI
  Studio. Pick a current Gemini model that takes images, and record its name
  and current free-tier limits here. Test 5 hand-labelled Bomb Sweeper frames
  in the AI Studio playground and record how many it read correctly. No code.
  (no files)
- [ ] **Proof of concept (M3).** `api/src/core/ai.ts` with one function that
  returns `{ label, confidence }` for a PNG, using Google's Gemini SDK, plus a
  script that runs it on the test frames. Add `GEMINI_API_KEY` with a fake
  value to `.env.example`. (`api/src/core/ai.ts`, `api/package.json`,
  `.env.example`)
- [ ] **Contract change (M3), with Soham.** Add an optional `label` to
  `SaveSchema`, and add `GuideRequest`/`GuideResponse`. Own PR. **Contract and
  data-model change.** (`packages/contracts/src/index.ts`)
- [ ] **Frame capture (M3).** `captureFrame(): Promise<Blob>` in
  `emulator.ts`. (`web/src/lib/emulator.ts`)
- [ ] **Save labels (M4).** The save upload sends a frame. The API labels it
  and stores the label on the save document. My Saves shows it. Mocks
  first. **`api.ts` signature change** (`uploadSave` takes the frame).
  (`api/src/routes/saves.ts`, `api/src/core/`, `web/src/lib/api.ts`,
  `web/src/pages/MySavesPage.tsx`)
- [ ] **Kubernetes Secret (M4), Khoi.** Add `GEMINI_API_KEY` to
  `arcade-secrets` and pass it to the API Deployment. The value never goes in git.
  (`infra/k8s/deployment.yaml`)
- [ ] **Game guide (M5, week 1).** Store the readme on import, add
  `POST /api/games/{id}/guide`, and add a keyboard-usable guide panel on the
  Play page. **Data-model change** (the game gets a `readme` field).
  (`api/src/jobs/import-games.ts`, which is Khoi's file, plus `api/src/routes/games.ts`,
  `web/src/pages/PlayPage.tsx`)
- [ ] **Score reader and leaderboard (M5, stretch).** Per-game rules in
  `games.json`, a `scores` collection, one submission per session, frames kept
  in GridFS for audit, and a leaderboard page. **Contract and data-model
  change.** Cut this first if M5 runs late.
- [ ] **Tests and docs (M5).** Unit tests for `ai.ts` with a mocked provider
  (valid answer, bad JSON, timeout, refusal, low confidence). A 20-frame
  accuracy check recorded here. A spec section on the AI features. The report
  section in M6.

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Every AI call goes through `api/src/core/ai.ts` | Keeps the key on the server, and the provider can change in one file | Calls from the browser |
| Labels and the guide before scores | They are low risk and build the shared pipeline. Scores need a new collection and anti-fraud work | Scores first |
| A failed AI call never fails a save | Saves are the core feature. AI is an extra | Blocking the save until the label is ready |
| Provider: **Gemini API, free tier** (key from Google AI Studio, no billing attached) | Free, takes image input, and its limits are enough for development and the demo. Google may use free-tier inputs to improve its products, so we send game frames and readme text only, never usernames, account data or save files | Claude (no free tier, about $0.008 a call, needs credits); a self-hosted model with Ollama (free, but slow on our laptops) |
| The key is `GEMINI_API_KEY`, read only by `api/src/core/ai.ts` | Keeps it out of the browser and out of git: local `.env`, `.env.example` with a fake value, and the `arcade-secrets` Secret on the cluster | A key in `web/` or a ConfigMap |
| A rate-limit or quota error is treated like any other AI failure | The free tier has per-minute and per-day limits; the save still works and shows its time | Retrying until the call succeeds |

## Out of scope
- AI recommendations and natural-language search, until the catalog has
  several games.
- Tamper-proof scores. The game runs in the player's browser, so the score
  reader only makes cheating harder. The report says so.
- Sending usernames, account data or save files to the AI provider.
- Any AI work that delays the nine final demo checks.

## Verification
- `pnpm --dir api test` covers `ai.ts` with a mocked provider. No test calls the
  real API.
- Save Bomb Sweeper at 3 different levels. Each card in My Saves shows the
  right level. Turn the key off, save again: the save works, and the card
  shows its time.
- Ask the guide "how do I move walls?" using only the keyboard. The answer
  matches the readme.
- Stretch: submit a score from a session that isn't yours and get a 403.
  Submit twice for one session and get a 409.
- Logs carry `sessionId`, `saveId` and `gameId` and never the frame, the key or
  a username (CLAUDE.md, Logging).
- None of these steps is one of the nine final demo checks. They add an AI
  demo step on top of the checklist.
