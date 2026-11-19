import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// One .env at the repo root serves both the API and the web app (see .env.example).
// Tests set their own variables (see vitest.config.ts) and skip the file.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url))
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) process.loadEnvFile(envFile)

/** Everything the API reads from the environment, with the defaults from .env.example. */
export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5080),
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27018',
  mongoDb: process.env.MONGO_DB ?? 'arcadehub',
  /** How long the driver waits for a reachable server before giving up. */
  mongoTimeoutMs: 3000,
  /**
   * ALLOW_STAND_IN_USER: a request with no token plays as the stand-in account
   * (see core/auth.ts). Off unless a deployment sets it: it is what keeps the
   * Nov 15 save-state check working on the cluster before sign-in lands in M3.
   */
  allowStandInUser: process.env.ALLOW_STAND_IN_USER === 'true',
  /** Sign-in (M3): the key bearer tokens are signed with, and the issuer they must carry. */
  jwtSigningKey: process.env.JWT_SIGNING_KEY ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'arcade-hub',
  /** SEED_DEV_USERS: create dev-player and dev-player2 on startup, in development only. */
  seedDevUsers: process.env.SEED_DEV_USERS === 'true',
  /** No fallback in code: a seeded account's password comes from the environment. */
  seedDevPassword: process.env.SEED_DEV_PASSWORD ?? '',
  /** Largest save state accepted, in bytes. EmulatorJS states are far smaller than game files. */
  maxSaveStateBytes: 10 * 1024 * 1024,
  /** Largest game file a player may upload, in bytes. nginx allows 100 MB (infra/nginx). */
  maxGameFileBytes: 100 * 1024 * 1024,
  /**
   * How long GET /api/health may wait for MongoDB before reporting it down, in
   * milliseconds. Kubernetes probes have a short timeout of their own, so a
   * missing database must not make the probe slow enough to restart the pod.
   */
  mongoHealthTimeoutMs: 750,
  /** Gemini API key from Google AI Studio (free tier). Empty turns the AI features off. */
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  /** The Gemini model that reads game frames. Pick one in AI Studio that takes images. */
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-flash-latest',
  /** How long one AI call may take before it counts as failed. */
  aiTimeoutMs: 10000,
}
