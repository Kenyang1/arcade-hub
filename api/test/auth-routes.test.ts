import jwt from 'jsonwebtoken'
import type { Db } from 'mongodb'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app.ts'
import { config } from '../src/config.ts'
import {
  DEV_USERNAME,
  USERS_COLLECTION,
  type UserDocument,
  userIdFromToken,
  verifyPassword,
} from '../src/core/auth.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { logger } from '../src/logger.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.
// Fake accounts only: no real person's username or password goes in git.

const PASSWORD = 'correct-horse-battery'

let db: Db

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await db.collection(USERS_COLLECTION).deleteMany({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(closeMongo)

function register(body: unknown) {
  return request(app).post('/api/auth/register').send(body as object)
}

function login(body: unknown) {
  return request(app).post('/api/auth/login').send(body as object)
}

/** Runs `run` with config changed, and puts it back afterwards. */
async function withConfig(change: Partial<typeof config>, run: () => Promise<void>): Promise<void> {
  const before = { ...config }
  Object.assign(config, change)
  try {
    await run()
  } finally {
    Object.assign(config, before)
  }
}

describe('POST /api/auth/register', () => {
  it('creates the account and answers 201 with a token for it', async () => {
    const res = await register({ username: 'player1', password: PASSWORD })

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ username: 'player1' })
    expect(Object.keys(res.body.user).sort()).toEqual(['createdAt', 'id', 'username'])
    expect(new Date(res.body.user.createdAt).toISOString()).toBe(res.body.user.createdAt)
    expect(userIdFromToken(res.body.token)).toBe(res.body.user.id)
  })

  it('stores a salted scrypt hash, never the password', async () => {
    await register({ username: 'player1', password: PASSWORD }).expect(201)
    await register({ username: 'player2', password: PASSWORD }).expect(201)

    const users = await db.collection<UserDocument>(USERS_COLLECTION).find({}).sort({ username: 1 }).toArray()
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
      expect(user.passwordHash).not.toContain(PASSWORD)
      expect(await verifyPassword(PASSWORD, user.passwordHash)).toBe(true)
    }
    // A random salt per user: the same password hashes differently.
    expect(users[0]?.passwordHash).not.toBe(users[1]?.passwordHash)
  })

  it('trims the username', async () => {
    const res = await register({ username: '  player1 ', password: PASSWORD }).expect(201)
    expect(res.body.user.username).toBe('player1')
  })

  it('answers 409 for a username that is taken', async () => {
    await register({ username: 'player1', password: PASSWORD }).expect(201)

    const res = await register({ username: 'player1', password: 'another-password' })
    expect(res.status).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.body.detail).toBe('That username is taken. Pick another one.')
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(1)
  })

  it('gives one of several people registering the same name at once the account', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => register({ username: 'player1', password: PASSWORD })),
    )

    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409, 409, 409])
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(1)
  })

  it('refuses the stand-in account name', async () => {
    const res = await register({ username: DEV_USERNAME, password: PASSWORD })
    expect(res.status).toBe(409)
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(0)
  })

  it.each([
    ['a short username', { username: 'ab', password: PASSWORD }, 'username'],
    ['a username with spaces', { username: 'player one', password: PASSWORD }, 'username'],
    ['a username over 32 characters', { username: 'p'.repeat(33), password: PASSWORD }, 'username'],
    ['a short password', { username: 'player1', password: 'short' }, 'password'],
    ['a password over 128 characters', { username: 'player1', password: 'p'.repeat(129) }, 'password'],
    ['no password', { username: 'player1' }, 'password'],
    ['a number for a username', { username: 42, password: PASSWORD }, 'username'],
  ])('answers 400 with field errors for %s', async (_name, body, field) => {
    const res = await register(body)

    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.body.errors?.[field]?.length).toBeGreaterThan(0)
    // The Sign in page shows `detail` as it is, so it names what to fix.
    expect(res.body.detail).toMatch(field === 'username' ? /username/i : /password/i)
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD)
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(0)
  })

  it('answers 503 and creates nothing when JWT_SIGNING_KEY is not set', async () => {
    await withConfig({ jwtSigningKey: '' }, async () => {
      const res = await register({ username: 'player1', password: PASSWORD })
      expect(res.status).toBe(503)
    })
    expect(await db.collection(USERS_COLLECTION).countDocuments()).toBe(0)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register({ username: 'player1', password: PASSWORD }).expect(201)
  })

  it('answers 200 with a token for the right password', async () => {
    const res = await login({ username: 'player1', password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('player1')
    const account = await db.collection<UserDocument>(USERS_COLLECTION).findOne({ username: 'player1' })
    expect(userIdFromToken(res.body.token)).toBe(account?._id.toHexString())
  })

  it('signs an HS256 token with the issuer and a 7-day lifetime', async () => {
    const res = await login({ username: 'player1', password: PASSWORD }).expect(200)

    const decoded = jwt.decode(res.body.token, { complete: true })
    expect(decoded?.header.alg).toBe('HS256')
    const payload = decoded?.payload as jwt.JwtPayload
    expect(payload.iss).toBe(config.jwtIssuer)
    expect(payload.sub).toBe(res.body.user.id)
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60 * 60 * 24 * 7)
    // Nothing about the password rides along in the token.
    expect(JSON.stringify(payload)).not.toContain(PASSWORD)
  })

  it('trims the username, like the Sign in page does', async () => {
    await login({ username: ' player1 ', password: PASSWORD }).expect(200)
  })

  it('answers the same 401 for a wrong password and an unknown username', async () => {
    const wrongPassword = await login({ username: 'player1', password: 'not-the-password' })
    const unknownUser = await login({ username: 'nobody', password: PASSWORD })
    const usernameCase = await login({ username: 'Player1', password: PASSWORD })

    for (const res of [wrongPassword, unknownUser, usernameCase]) {
      expect(res.status).toBe(401)
      expect(res.body.detail).toBe("That username and password don't match.")
      expect(res.body.token).toBeUndefined()
    }
  })

  it('answers 401 for an empty or oversized password without checking it', async () => {
    await login({ username: 'player1', password: '' }).expect(401)
    await login({ username: 'player1', password: 'p'.repeat(129) }).expect(401)
  })

  it('answers 400 when the body is not a username and a password', async () => {
    const res = await login({ username: 'player1' })
    expect(res.status).toBe(400)
    expect(res.body.errors?.password?.length).toBeGreaterThan(0)
  })

  it('answers 503 when JWT_SIGNING_KEY is not set', async () => {
    await withConfig({ jwtSigningKey: '' }, async () => {
      await login({ username: 'player1', password: PASSWORD }).expect(503)
    })
  })
})

describe('a token from sign-in', () => {
  it('opens signed-in routes as that account, without the stand-in switch', async () => {
    await withConfig({ allowStandInUser: false }, async () => {
      const { body } = await register({ username: 'player1', password: PASSWORD }).expect(201)

      await request(app).get('/api/saves').expect(401)
      const res = await request(app).get('/api/saves').set('Authorization', `Bearer ${body.token}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  it('is refused when it was signed with another key', async () => {
    const { body } = await register({ username: 'player1', password: PASSWORD }).expect(201)
    const forged = jwt.sign({}, 'some-other-key', {
      subject: body.user.id,
      issuer: config.jwtIssuer,
      algorithm: 'HS256',
    })

    await withConfig({ allowStandInUser: false }, async () => {
      await request(app).get('/api/saves').set('Authorization', `Bearer ${forged}`).expect(401)
    })
  })
})

describe('logs', () => {
  it('never carry the username, the password or the token', async () => {
    const calls: unknown[][] = []
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        calls.push(args)
      }) as never)
    }

    const created = await register({ username: 'player1', password: PASSWORD }).expect(201)
    const signedIn = await login({ username: 'player1', password: PASSWORD }).expect(200)
    await login({ username: 'player1', password: 'not-the-password' }).expect(401)
    await register({ username: 'player1', password: PASSWORD }).expect(409)
    await register({ username: 'p', password: 'short' }).expect(400)

    expect(calls.length).toBeGreaterThan(0)
    const logged = JSON.stringify(calls)
    for (const secret of [PASSWORD, 'not-the-password', 'player1', created.body.token, signedIn.body.token]) {
      expect(logged).not.toContain(secret)
    }
    expect(logged).toContain(created.body.user.id)
  })
})
