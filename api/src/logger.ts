import pino from 'pino'
import { config } from './config.ts'

// Structured JSON logs with sessionId, saveId, gameId and userId fields (see
// CLAUDE.md, "Logging"). Quiet in tests so a failure stands out.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.nodeEnv === 'test' ? 'silent' : 'info'),
})
