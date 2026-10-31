// The contract between pages and the API (see CLAUDE.md, "The data contract").
// The Contracts step moves these types into packages/contracts as zod schemas;
// this file then re-exports them, so pages keep importing from here.
// Changing anything here is a contract change: its own PR, reviewed by Soham.
//
// Ids are strings. Dates are ISO 8601 strings in UTC.

/** EmulatorJS system name. The API stores it as a plain string. */
export type EmulatorCore = 'nes' | 'snes' | 'gb' | 'gba'

export interface Game {
  id: string
  title: string
  description: string
  genre: string
  core: EmulatorCore
  createdAt: string
}

/** Body of POST /api/games and PUT /api/games/{id}. On POST the game file travels with it as multipart form data. */
export interface GameInput {
  title: string
  description: string
  genre: string
  core: EmulatorCore
}

/** Query string of GET /api/games. */
export interface GameQuery {
  search?: string
  genre?: string
}

export type SessionStatus = 'running' | 'paused' | 'idle' | 'ended'

export interface Session {
  id: string
  userId: string
  gameId: string
  status: SessionStatus
  lastHeartbeatAt: string
  lastAutosaveId: string | null
}

/** Body of POST /api/sessions. */
export interface StartSessionRequest {
  gameId: string
  /** Resume from this save. Omit to start fresh. */
  saveId?: string
}

/** Response of POST /api/sessions: everything the player page needs to load EmulatorJS. */
export interface StartSessionResponse {
  sessionId: string
  gameFileUrl: string
  core: EmulatorCore
  /** Null when starting fresh. */
  saveFileUrl: string | null
}

/** Body of PATCH /api/sessions/{id}: pause or resume. */
export interface UpdateSessionRequest {
  status: 'running' | 'paused'
}

export type SaveKind = 'manual' | 'autosave'

export interface Save {
  id: string
  userId: string
  gameId: string
  kind: SaveKind
  createdAt: string
}

export interface User {
  id: string
  username: string
  createdAt: string
}

/** Body of POST /api/auth/register and POST /api/auth/login. */
export interface Credentials {
  username: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

/** Error body from the API (ProblemDetails, RFC 9457). api.ts turns it into a message. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  /** Validation errors (400): field name to messages. */
  errors?: Record<string, string[]>
}
