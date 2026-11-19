# Session handoff: the AI save labels

- **Date:** 2026-11-19
- **Plan:** [2026-11-10-ai-integration.md](plans/2026-11-10-ai-integration.md)
- **Working tree:** clean on `main` as of `337c768`; the two branches below are open.

This is a note for whoever picks the AI work up, not a plan. Delete it once the
AI labels are on `main` and checked on the cluster.

## Where the AI features stand

Three of the pieces are merged, one is open, and one deployment step is nobody's
yet.

| Piece | Where it is | Notes |
| --- | --- | --- |
| `api/src/core/ai.ts` (Gemini call, prompt, schema, `labelFrame`) | `main` | Unit-tested in `api/test/ai.test.ts` with a fake model. No test calls a real provider. `pnpm --dir api ai:label <folder>` runs it on frames by hand. |
| Frame capture (`captureFrame()` in `web/src/lib/emulator.ts`) | `main` | Uses `gameManager.screenshot()`, not `takeScreenshot()`, which hangs at native size. Not called by any page yet. |
| The label on the contract (`Save.label`, optional, max 60) | `main` (PR #22, `337c768`) | Also the mock labels and the My Saves card showing the time when there is no label. |
| The API that writes the label (`feat/save-labels-api`) | **open**, tip `4433f2d` | Adds `labelSave()`, the optional `frame` file part, and `api/test/save-labels.test.ts`. Changes `packages/contracts` again (`SAVE_FRAME_FIELD`), so it needs Kenyang **and** Soham to review. |
| Sign-in, My Saves and autosave (`feat/sign-in-saves-autosave`) | **open**, tip `ae6ff1b` | `uploadSave()` becomes a real call. The frame part is the next step on top of it. |

**The one thing to know:** on `main` the contract has `Save.label`, but
`toSave()` in `api/src/core/saves.ts` never maps it and the `saves` document
has no `label` field. The field is inert until `feat/save-labels-api` merges:
`GET /api/saves` cannot return a label today, and no page will ever show one.
Merging #22 alone broke nothing, but it also turned nothing on.

## Order to land the rest

1. Review and merge `feat/save-labels-api` (contract change: both reviewers).
   Verify with `pnpm --dir api test`; the new tests cover a label, a missing
   frame, an AI failure and a low-confidence answer.
2. On top of `feat/sign-in-saves-autosave`, send `captureFrame()` with the
   upload in `web/src/lib/api.ts` (`uploadSave` gains a frame parameter, an
   `api.ts` signature change, so its own PR) and from `PlayPage.tsx`.
3. Khoi adds `GEMINI_API_KEY` to the `arcade-secrets` Secret and the API
   Deployment. It is already in `.env.example` with a fake value.

## Rules that bite here

- The key is read only by `api/src/core/ai.ts`, never by the browser. A request
  without a key must still save; `labelFrame()` returns null instead of throwing.
- Labels never make a save slower or fail it: the label is written after the
  response is sent.
- Logs carry `saveId`, `gameId` and `sessionId`, plus the model's confidence on
  success — never the frame, the key or a username.
- No screenshots of real accounts or game files go in git (CLAUDE.md,
  "What never goes in git").

## How to check it by hand

```bash
docker compose up -d mongo
pnpm --dir api test          # fake provider only; no key needed
pnpm --dir api ai:label <folder-with-frames>   # needs GEMINI_API_KEY in .env
```

Then, with a key set: play a game, save, and open My Saves. The card shows the
label within a few seconds. Clear the key and save again: the save still works
and the card shows its time.
