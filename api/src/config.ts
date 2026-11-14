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
  /** Sign-in (M3): the key bearer tokens are signed with, and the issuer they must carry. */
  jwtSigningKey: process.env.JWT_SIGNING_KEY ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'arcade-hub',
  /** SEED_DEV_USERS: create dev-player and dev-player2 on startup, in development only. */
  seedDevUsers: process.env.SEED_DEV_USERS === 'true',
  seedDevPassword: process.env.SEED_DEV_PASSWORD ?? 'dev-password-123',
  /** Largest save state accepted, in bytes. EmulatorJS states are far smaller than game files. */
  maxSaveStateBytes: 10 * 1024 * 1024,
}
