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
}
