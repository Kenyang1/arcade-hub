# Create an account and sign in through the API

- **Status:** in progress
- **Owner:** Kenyang (a backup for Soham's routes; `api/` is Soham's, so he reviews)
- **Milestone:** M3 Save and resume (exit check Sun Nov 22)
- **Date:** 2026-11-19
- **PR:** <link once opened>

## Goal
A player creates an account or signs in from the Sign in page and gets a
bearer token the rest of the API accepts. With PR #27 this completes the Nov 22
exit check: sign in, save, close the tab, resume on another computer.

## Context
- `api/src/core/auth.ts` (Soham, PR #18) already hashes and checks passwords
  with `scrypt`, signs and verifies HS256 tokens with `JWT_SIGNING_KEY`, and
  reads the bearer token on every signed-in route.
- `users.username` has a unique index (`core/indexes.ts`).
- The shapes are already in `packages/contracts`: `Credentials` in,
  `AuthResponse` (`token`, `user`) out.
- PR #27's `api.ts` expects 201 or 200 with `AuthResponse`, 409 for a taken
  username, 401 for a wrong username or password, and 400 with `errors` for
  bad input. Its form trims the username and asks for 8+ character passwords.

## Approach
Two routes in `api/src/routes/auth.ts` that only parse the body and call two
new functions in `core/auth.ts`: `registerUser` and `signIn`. Core does the
hashing, the duplicate check (the unique index decides a race) and the token.
No contract change: the API checks the username and password rules itself and
answers 400 with field errors.

Rejected: adding the rules to `CredentialsSchema` (a contract change that needs
both owners, and login must not reveal the rules anyway); a session cookie
instead of a JWT (the rest of the API already reads bearer tokens).

## Steps
- [x] `docs/plans/`: this plan (first commit).
- [ ] `core/auth.ts`: `registerUser`, `signIn`, `toUser`; the username and
  password rules. `routes/auth.ts`: `POST /api/auth/register` (201) and
  `POST /api/auth/login` (200). `app.ts`, `openapi.ts`.
- [ ] `test/auth-routes.test.ts`: register, duplicate, reserved name, bad
  input, login, wrong password, unknown user, the token on a signed-in route,
  nothing secret in the logs.

## Decisions
| Decision | Why | Rejected |
| --- | --- | --- |
| Username: 3 to 32 letters, digits, `.`, `_` or `-`, trimmed, case kept | Shows safely in the top bar and in URLs | Any string |
| Password: 8 to 128 characters on register | Matches the web form's `minLength`; the cap keeps a huge body from tying up `scrypt` | No cap |
| `dev-player` can't be registered (409) | With `ALLOW_STAND_IN_USER` on, every request without a token plays as it | Allowing it |
| Login answers the same 401 for an unknown user and a wrong password, and runs `scrypt` either way | Doesn't tell a stranger which usernames exist | 404 for an unknown user |
| No `JWT_SIGNING_KEY` answers 503 | A missing Secret is a deployment problem, not the player's | A 500 |
| Logs carry `userId` only | CLAUDE.md, "Logging": never usernames, passwords or tokens | Logging the username |

## Out of scope
Rate limiting sign-in attempts; changing a password; signing out on the server
(tokens last 7 days, as `core/auth.ts` already sets); removing
`ALLOW_STAND_IN_USER`, which comes out once sign-in is checked on the cluster.

## Verification
- `pnpm --dir api lint`, `typecheck`, `test` and `build` pass.
- In Swagger at `/swagger`: register `player1`, then log in, then call
  `GET /api/saves` with the token.
- With PR #27 running locally: Create account, play, save, sign in in another
  browser, My Saves shows the save.
