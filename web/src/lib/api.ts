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
  const params = new URLSearchParams()
  const search = query.search?.trim()
  if (search) params.set('search', search)
  if (query.genre) params.set('genre', query.genre)
  const queryString = params.toString()
  return request<Game[]>('GET', queryString ? `/games?${queryString}` : '/games')
}

/** GET /api/games/{id} */
export async function getGame(id: string): Promise<Game> {
  try {
    return await request<Game>('GET', `/games/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(404, 'That game does not exist.', error.problem)
    }
    throw error
  }
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

/**
 * GET a game file: gameFileUrl(id) in M1, the session's gameFileUrl from M2.
 * A real call, since game files never live in mocks or in git. The Play page
 * hands the bytes to EmulatorJS as a blob: URL (see emulator.ts).
 */
export async function downloadGameFile(url: string): Promise<Blob> {
  const response = await send(url, { headers: authHeaders() })
  if (!response.ok) throw await toApiError(response)
  const file = await response.blob()
  if (file.size === 0) throw new ApiError(response.status, 'The game file is empty.')
  return file
}

// --- Sessions (M2, M4) -----------------------------------------------------

/** POST /api/sessions. Starts a session, optionally from a save. */
export async function startSession(start: StartSessionRequest): Promise<StartSessionResponse> {
  return request<StartSessionResponse>('POST', '/sessions', start)
}

/** GET /api/sessions/{id} */
export async function getSession(id: string): Promise<Session> {
  return { ...mockSession, id }
}

/** POST /api/sessions/{id}/heartbeat. The player page calls this every 30 s. */
export async function heartbeat(sessionId: string): Promise<void> {
  await request<void>('POST', `/sessions/${encodeURIComponent(sessionId)}/heartbeat`)
}

/** PATCH /api/sessions/{id}. Pause or resume (M4). */
export async function updateSession(sessionId: string, request: UpdateSessionRequest): Promise<Session> {
  if (sessionId === mockSession.id) mockSession.status = request.status
  return { ...mockSession, id: sessionId, status: request.status }
}

/** DELETE /api/sessions/{id} */
export async function endSession(sessionId: string): Promise<void> {
  await request<void>('DELETE', `/sessions/${encodeURIComponent(sessionId)}`)
}

// --- Saves (M2, M3) --------------------------------------------------------

/**
 * POST /api/sessions/{id}/saves. Uploads a save state, manual or autosave, as
 * multipart form data: a `kind` field and the state as a file field named `state`.
 */
export async function uploadSave(sessionId: string, kind: SaveKind, state: Uint8Array): Promise<Save> {
  if (state.byteLength === 0) throw new ApiError(400, 'The save state is empty.')
  const form = new FormData()
  form.set('kind', kind)
  form.set('state', new Blob([new Uint8Array(state)], { type: 'application/octet-stream' }), 'state.bin')
  return request<Save>('POST', `/sessions/${encodeURIComponent(sessionId)}/saves`, form)
}

/** GET /api/saves?gameId=. The signed-in player's saves, newest first. */
export async function listSaves(gameId?: string): Promise<Save[]> {
  return mockSaves
    .filter((save) => !gameId || save.gameId === gameId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** URL of GET /api/saves/{id}/file, where a save state downloads from. */
export function saveFileUrl(id: string): string {
  return `${API_BASE}/saves/${id}/file`
}

/**
 * GET a save state: the session's saveFileUrl when resuming. The Play page loads
 * the bytes into EmulatorJS once the game runs (see emulator.loadSaveState).
 */
export async function downloadSaveFile(url: string): Promise<Uint8Array> {
  const response = await send(url, { headers: authHeaders() })
  if (!response.ok) throw await toApiError(response)
  const state = new Uint8Array(await response.arrayBuffer())
  if (state.byteLength === 0) throw new ApiError(response.status, 'The save file is empty.')
  return state
}

// --- Real calls ------------------------------------------------------------

/**
 * Sends a request to the API with the bearer token and turns a ProblemDetails
 * body into an ApiError. The functions above switch to this as endpoints land.
 */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = authHeaders()

  let payload: BodyInit | undefined
  if (body instanceof FormData || body instanceof Blob) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await send(`${API_BASE}${path}`, { method, headers, body: payload })
  if (!response.ok) throw await toApiError(response)
  // 204, or an empty 200 from an endpoint that sends nothing back (heartbeat, end).
  if (response.status === 204 || !response.headers.get('content-type')?.includes('json')) return undefined as T
  return (await response.json()) as T
}

/** fetch, with a plain message when the server can't be reached at all. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that the API is running.')
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
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
