// The only module that calls the API. Pages and components import from here
// and from types.ts; they never call fetch themselves (see CLAUDE.md, "The
// data contract"). Every function returns mocks until its endpoint exists.
// Then its body changes to a real call through request(); its signature stays.

import { mockGames, mockSaves, mockSession, mockToken, mockUser } from './mocks.ts'
import type {
  AuthResponse,
  Credentials,
  Game,
  GameInput,
  GameQuery,
  ProblemDetails,
  Save,
  SaveKind,
  Session,
  StartSessionRequest,
  StartSessionResponse,
  UpdateSessionRequest,
  User,
} from './types.ts'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_KEY = 'arcade-hub.token'
const USER_KEY = 'arcade-hub.user'

/** An API error whose message a page can show as it is. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetails | undefined

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

/** Turns anything thrown into a plain message for the page. Never a raw status code. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

// --- Auth (M3) -------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? (JSON.parse(raw) as User) : null
}

function storeAuth(auth: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, auth.token)
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user))
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** POST /api/auth/register */
export async function register(credentials: Credentials): Promise<AuthResponse> {
  const auth: AuthResponse = { token: mockToken, user: { ...mockUser, username: credentials.username } }
  storeAuth(auth)
  return auth
}

/** POST /api/auth/login */
export async function login(credentials: Credentials): Promise<AuthResponse> {
  const auth: AuthResponse = { token: mockToken, user: { ...mockUser, username: credentials.username } }
  storeAuth(auth)
  return auth
}

// --- Catalog (M1) ----------------------------------------------------------

/** GET /api/games?search=&genre= */
export async function listGames(query: GameQuery = {}): Promise<Game[]> {
  const search = query.search?.trim().toLowerCase()
  return mockGames.filter(
    (game) =>
      (!search || game.title.toLowerCase().includes(search)) &&
      (!query.genre || game.genre === query.genre),
  )
}

/** GET /api/games/{id} */
export async function getGame(id: string): Promise<Game> {
  const game = mockGames.find((candidate) => candidate.id === id)
  if (!game) throw new ApiError(404, 'That game does not exist.')
  return game
}

/** POST /api/games. The game file goes along as multipart form data. */
export async function createGame(input: GameInput, _file: File): Promise<Game> {
  const game: Game = { ...input, id: `g${mockGames.length + 1}`, createdAt: new Date().toISOString() }
  mockGames.push(game)
  return game
}

/** PUT /api/games/{id} */
export async function updateGame(id: string, input: GameInput): Promise<Game> {
  const game = await getGame(id)
  Object.assign(game, input)
  return game
}

/** DELETE /api/games/{id} */
export async function deleteGame(id: string): Promise<void> {
  const index = mockGames.findIndex((game) => game.id === id)
  if (index < 0) throw new ApiError(404, 'That game does not exist.')
  mockGames.splice(index, 1)
}

/** URL of GET /api/games/{id}/file (M2), where EmulatorJS downloads the game. */
export function gameFileUrl(id: string): string {
  return `${API_BASE}/games/${id}/file`
}

// --- Sessions (M2, M4) -----------------------------------------------------

/** POST /api/sessions. Starts a session, optionally from a save. */
export async function startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
  const game = await getGame(request.gameId)
  return {
    sessionId: mockSession.id,
    gameFileUrl: gameFileUrl(game.id),
    core: game.core,
    saveFileUrl: request.saveId ? saveFileUrl(request.saveId) : null,
  }
}

/** GET /api/sessions/{id} */
export async function getSession(id: string): Promise<Session> {
  return { ...mockSession, id }
}

/** POST /api/sessions/{id}/heartbeat. The player page calls this every 30 s. */
export async function heartbeat(sessionId: string): Promise<void> {
  if (sessionId === mockSession.id) mockSession.lastHeartbeatAt = new Date().toISOString()
}

/** PATCH /api/sessions/{id}. Pause or resume (M4). */
export async function updateSession(sessionId: string, request: UpdateSessionRequest): Promise<Session> {
  if (sessionId === mockSession.id) mockSession.status = request.status
  return { ...mockSession, id: sessionId, status: request.status }
}

/** DELETE /api/sessions/{id} */
export async function endSession(sessionId: string): Promise<void> {
  if (sessionId === mockSession.id) mockSession.status = 'ended'
}

// --- Saves (M3) ------------------------------------------------------------

/** POST /api/sessions/{id}/saves. Uploads a save state, manual or autosave. */
export async function uploadSave(sessionId: string, kind: SaveKind, state: Uint8Array): Promise<Save> {
  if (state.byteLength === 0) throw new ApiError(400, 'The save state is empty.')
  const session = await getSession(sessionId)
  const save: Save = {
    id: `s${mockSaves.length + 1}`,
    userId: session.userId,
    gameId: session.gameId,
    kind,
    createdAt: new Date().toISOString(),
  }
  mockSaves.push(save)
  return save
}

/** GET /api/saves?gameId=. The signed-in player's saves, newest first. */
export async function listSaves(gameId?: string): Promise<Save[]> {
  return mockSaves
    .filter((save) => !gameId || save.gameId === gameId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** URL of GET /api/saves/{id}/file, where EmulatorJS downloads a save state. */
export function saveFileUrl(id: string): string {
  return `${API_BASE}/saves/${id}/file`
}

// --- Real calls ------------------------------------------------------------

/**
 * Sends a request to the API with the bearer token and turns a ProblemDetails
 * body into an ApiError. The functions above switch to this as endpoints land.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let payload: BodyInit | undefined
  if (body instanceof FormData || body instanceof Blob) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: payload })
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Some of what you entered is not valid.',
  401: 'Please sign in first.',
  403: 'That is not yours to change.',
  404: 'Not found.',
  409: 'A game with that title already exists.',
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails | undefined
  if (response.headers.get('content-type')?.includes('json')) {
    problem = (await response.json()) as ProblemDetails
  }
  const message =
    problem?.detail ??
    problem?.title ??
    FALLBACK_MESSAGES[response.status] ??
    'The server had a problem. Please try again.'
  return new ApiError(response.status, message, problem)
}
