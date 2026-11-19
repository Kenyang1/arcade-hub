// api.ts against a fake fetch: the auth calls, the 401 sign-out rule and the
// saves list. No server and no browser: localStorage and window are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentUser, getSession, getToken, listSaves, login, onAuthChange, register, signOut } from './api.ts'
import type { AuthResponse } from './types.ts'

const auth: AuthResponse = {
  token: 'token-1',
  user: { id: 'u1', username: 'player1', createdAt: '2026-11-15T00:00:00.000Z' },
}

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, String(value))
    },
  }
}

function json(status: number, body: unknown, type = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } })
}

function problem(status: number, detail: string): Response {
  return json(status, { status, detail }, 'application/problem+json')
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('window', new EventTarget())
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return { url: String(call[0]), init: call[1] ?? {} }
}

describe('login and register', () => {
  it('login posts the credentials and stores the token and user', async () => {
    fetchMock.mockResolvedValue(json(200, auth))
    const changed = vi.fn()
    onAuthChange(changed)

    await expect(login({ username: 'player1', password: 'pass-word-1' })).resolves.toEqual(auth)

    const { url, init } = lastCall()
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ username: 'player1', password: 'pass-word-1' })
    expect(getToken()).toBe('token-1')
    expect(getCurrentUser()).toEqual(auth.user)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('register posts to /auth/register and signs in as the new account', async () => {
    fetchMock.mockResolvedValue(json(201, auth))
    await register({ username: 'player1', password: 'pass-word-1' })
    expect(lastCall().url).toBe('/api/auth/register')
    expect(getToken()).toBe('token-1')
  })

  it('a wrong password says so, and does not sign anyone out', async () => {
    localStorage.setItem('arcade-hub.token', 'old-token')
    fetchMock.mockResolvedValue(problem(401, 'Please sign in first.'))
    await expect(login({ username: 'player1', password: 'wrong-pass' })).rejects.toThrow(
      "That username and password don't match.",
    )
    expect(getToken()).toBe('old-token')
  })

  it('a taken username says so', async () => {
    fetchMock.mockResolvedValue(problem(409, 'Conflict'))
    await expect(register({ username: 'player1', password: 'pass-word-1' })).rejects.toThrow(
      'That username is taken. Pick another one.',
    )
    expect(getToken()).toBeNull()
  })

  it('before the auth routes exist, says accounts are not switched on yet', async () => {
    fetchMock.mockResolvedValue(problem(404, 'Not found'))
    await expect(login({ username: 'player1', password: 'pass-word-1' })).rejects.toThrow(
      "Accounts aren't switched on on the server yet.",
    )
  })

  it('passes a validation message from the API through', async () => {
    fetchMock.mockResolvedValue(problem(400, 'Username must be 3 to 20 letters or digits.'))
    await expect(register({ username: '!', password: 'pass-word-1' })).rejects.toThrow(
      'Username must be 3 to 20 letters or digits.',
    )
  })

  it('signOut clears the token and tells listeners', () => {
    localStorage.setItem('arcade-hub.token', 'token-1')
    localStorage.setItem('arcade-hub.user', JSON.stringify(auth.user))
    const changed = vi.fn()
    const unsubscribe = onAuthChange(changed)
    signOut()
    expect(getToken()).toBeNull()
    expect(getCurrentUser()).toBeNull()
    expect(changed).toHaveBeenCalledTimes(1)
    unsubscribe()
    signOut()
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('a damaged stored user reads as signed out', () => {
    localStorage.setItem('arcade-hub.user', '{not json')
    expect(getCurrentUser()).toBeNull()
  })
})

describe('signed-in requests', () => {
  it('send the bearer token', async () => {
    localStorage.setItem('arcade-hub.token', 'token-1')
    fetchMock.mockImplementation(async () => json(200, []))
    await listSaves()
    expect(new Headers(lastCall().init.headers).get('Authorization')).toBe('Bearer token-1')
  })

  it('a 401 with a token signs out and says the sign-in ran out', async () => {
    localStorage.setItem('arcade-hub.token', 'expired')
    localStorage.setItem('arcade-hub.user', JSON.stringify(auth.user))
    fetchMock.mockResolvedValue(problem(401, 'Please sign in first.'))
    await expect(listSaves()).rejects.toThrow('Your sign-in ran out. Please sign in again.')
    expect(getToken()).toBeNull()
    expect(getCurrentUser()).toBeNull()
  })

  it('a 401 without a token just asks to sign in', async () => {
    fetchMock.mockResolvedValue(problem(401, 'Please sign in first.'))
    await expect(listSaves()).rejects.toThrow('Please sign in first.')
  })
})

describe('saves and sessions', () => {
  it('listSaves reads GET /api/saves, filtered by game when asked', async () => {
    fetchMock.mockImplementation(async () => json(200, []))
    await listSaves()
    expect(lastCall().url).toBe('/api/saves')
    await listSaves('6740a1b2c3d4e5f6a7b8c9d0')
    expect(lastCall().url).toBe('/api/saves?gameId=6740a1b2c3d4e5f6a7b8c9d0')
  })

  it('getSession reads GET /api/sessions/{id}', async () => {
    const session = {
      id: 's1',
      userId: 'u1',
      gameId: 'g1',
      status: 'running',
      lastHeartbeatAt: '2026-11-15T00:00:00.000Z',
      lastAutosaveId: null,
    }
    fetchMock.mockResolvedValue(json(200, session))
    await expect(getSession('s1')).resolves.toEqual(session)
    expect(lastCall().url).toBe('/api/sessions/s1')
  })
})
