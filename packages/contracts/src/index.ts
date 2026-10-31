// THE contract between the web app and the API (see CLAUDE.md, "The data contract").
// Every request and response is a zod schema here, plus the TypeScript type
// inferred from it. The API validates with the schemas; the web app imports
// only the types, through web/src/lib/types.ts.
//
// Owned by Kenyang and Soham together. Changing anything here is a contract
// change: its own PR, reviewed by both.
//
// Ids are strings. Dates are ISO 8601 strings in UTC.

import { z } from 'zod'

/** EmulatorJS system name. The API stores it as a plain string. */
export const EmulatorCoreSchema = z.enum(['nes', 'snes', 'gb', 'gba'])
export type EmulatorCore = z.infer<typeof EmulatorCoreSchema>

export const GameSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  core: EmulatorCoreSchema,
  createdAt: z.string(),
})
export type Game = z.infer<typeof GameSchema>

/** Body of POST /api/games and PUT /api/games/{id}. On POST the game file travels with it as multipart form data. */
export const GameInputSchema = z.object({
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  core: EmulatorCoreSchema,
})
export type GameInput = z.infer<typeof GameInputSchema>

/** Query string of GET /api/games. */
export const GameQuerySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
})
export type GameQuery = z.infer<typeof GameQuerySchema>

export const SessionStatusSchema = z.enum(['running', 'paused', 'idle', 'ended'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  gameId: z.string(),
  status: SessionStatusSchema,
  lastHeartbeatAt: z.string(),
  lastAutosaveId: z.string().nullable(),
})
export type Session = z.infer<typeof SessionSchema>

/** Body of POST /api/sessions. */
export const StartSessionRequestSchema = z.object({
  gameId: z.string(),
  /** Resume from this save. Omit to start fresh. */
  saveId: z.string().optional(),
})
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>

/** Response of POST /api/sessions: everything the player page needs to load EmulatorJS. */
export const StartSessionResponseSchema = z.object({
  sessionId: z.string(),
  gameFileUrl: z.string(),
  core: EmulatorCoreSchema,
  /** Null when starting fresh. */
  saveFileUrl: z.string().nullable(),
})
export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>

/** Body of PATCH /api/sessions/{id}: pause or resume. */
export const UpdateSessionRequestSchema = z.object({
  status: z.enum(['running', 'paused']),
})
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>

export const SaveKindSchema = z.enum(['manual', 'autosave'])
export type SaveKind = z.infer<typeof SaveKindSchema>

export const SaveSchema = z.object({
  id: z.string(),
  userId: z.string(),
  gameId: z.string(),
  kind: SaveKindSchema,
  createdAt: z.string(),
})
export type Save = z.infer<typeof SaveSchema>

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  createdAt: z.string(),
})
export type User = z.infer<typeof UserSchema>

/** Body of POST /api/auth/register and POST /api/auth/login. */
export const CredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
})
export type Credentials = z.infer<typeof CredentialsSchema>

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

/** Error body from the API (ProblemDetails, RFC 9457). api.ts turns it into a message. */
export const ProblemDetailsSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Validation errors (400): field name to messages. */
  errors: z.record(z.string(), z.array(z.string())).optional(),
})
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>
