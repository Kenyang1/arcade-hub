import { ObjectId, type Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { currentUser, signToken } from '../src/core/auth.ts'
import type { GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { SAVES_COLLECTION, type SaveDocument } from '../src/core/saves.ts'
import { SESSIONS_COLLECTION, type SessionDocument } from '../src/core/sessions.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.
// Sign-in lands in M3, so requests with no token play as the stand-in account.

let db: Db
let game: GameDocument
let player: ObjectId
let otherPlayer: ObjectId

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await Promise.all(
    ['games', 'users', SESSIONS_COLLECTION, SAVES_COLLECTION].map((name) =>
      db.collection(name).deleteMany({}),
    ),
  )

  game = {
    _id: new ObjectId(),
    title: 'Bomb Sweeper',
    description: 'Clear the minefield without stepping on a bomb.',
    genre: 'Puzzle',
    core: 'nes',
    romFileId: new ObjectId(),
    createdAt: new Date('2026-10-30T12:00:00.000Z'),
  }
  await db.collection<GameDocument>('games').insertOne(game)

  player = await currentUser(db, undefined)
  otherPlayer = new ObjectId()
})

afterAll(closeMongo)

async function insertSession(
  userId: ObjectId,
  status: SessionDocument['status'] = 'running',
): Promise<SessionDocument> {
  const session: SessionDocument = {
    _id: new ObjectId(),
    userId,
    gameId: game._id,
    status,
    lastHeartbeatAt: new Date(0),
    lastAutosaveId: null,
  }
  await db.collection<SessionDocument>(SESSIONS_COLLECTION).insertOne(session)
  return session
}

async function insertSave(userId: ObjectId, gameId: ObjectId = game._id): Promise<SaveDocument> {
  const save: SaveDocument = {
    _id: new ObjectId(),
    userId,
    gameId,
    stateFileId: new ObjectId(),
    kind: 'manual',
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
  }
  await db.collection<SaveDocument>(SAVES_COLLECTION).insertOne(save)
  return save
}

describe('POST /api/sessions', () => {
  it('starts a running session and answers with what the player page needs', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ gameId: game._id.toHexString() })
      .expect(201)

    expect(response.body).toMatchObject({
      gameFileUrl: `/api/games/${game._id.toHexString()}/file`,
      core: 'nes',
      saveFileUrl: null,
    })
    expect(response.body.sessionId).toEqual(expect.any(String))

    const session = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: new ObjectId(response.body.sessionId as string) })
    expect(session).toMatchObject({ status: 'running', gameId: game._id, userId: player, lastAutosaveId: null })
  })

  it('points at the save when resuming', async () => {
    const save = await insertSave(player)

    const response = await request(app)
      .post('/api/sessions')
      .send({ gameId: game._id.toHexString(), saveId: save._id.toHexString() })
      .expect(201)

    expect(response.body.saveFileUrl).toBe(`/api/saves/${save._id.toHexString()}/file`)
  })

  it('answers an unknown game with ProblemDetails', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .send({ gameId: new ObjectId().toHexString() })
      .expect(404)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ status: 404, detail: 'That game does not exist.' })
  })

  it('answers an invalid body with the offending field', async () => {
    const response = await request(app).post('/api/sessions').send({}).expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body.errors).toHaveProperty('gameId')
  })

  it("refuses another player's save", async () => {
    const save = await insertSave(otherPlayer)

    const response = await request(app)
      .post('/api/sessions')
      .send({ gameId: game._id.toHexString(), saveId: save._id.toHexString() })
      .expect(403)

    expect(response.body).toMatchObject({ status: 403, detail: 'That save is not yours.' })
  })

  it('refuses a save from a different game', async () => {
    const save = await insertSave(player, new ObjectId())

    const response = await request(app)
      .post('/api/sessions')
      .send({ gameId: game._id.toHexString(), saveId: save._id.toHexString() })
      .expect(400)

    expect(response.body).toMatchObject({ status: 400, detail: 'That save belongs to a different game.' })
  })

  it('ignores a token-free request only outside production', async () => {
    // In tests (NODE_ENV=test) the stand-in account plays; production would be a 401.
    const response = await request(app).post('/api/sessions').send({ gameId: game._id.toHexString() })
    expect(response.status).toBe(201)

    const withoutBody = await request(app)
      .post('/api/sessions')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ gameId: game._id.toHexString() })
      .expect(401)
    expect(withoutBody.body).toMatchObject({ status: 401, detail: 'Please sign in first.' })
  })
})

describe('POST /api/sessions/{id}/heartbeat', () => {
  it('records the heartbeat and answers 204', async () => {
    const session = await insertSession(player)

    await request(app).post(`/api/sessions/${session._id.toHexString()}/heartbeat`).expect(204)

    const updated = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: session._id })
    expect(updated?.lastHeartbeatAt.getTime()).toBeGreaterThan(0)
    expect(updated?.status).toBe('running')
  })

  it('accepts the token of the session owner', async () => {
    const session = await insertSession(otherPlayer)

    await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/heartbeat`)
      .set('Authorization', `Bearer ${signToken(otherPlayer.toHexString())}`)
      .expect(204)
  })

  it("refuses another player's session", async () => {
    const session = await insertSession(otherPlayer)

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/heartbeat`)
      .expect(403)
    expect(response.body).toMatchObject({ detail: 'That session is not yours.' })
  })

  it('answers an unknown or malformed id with 404', async () => {
    for (const id of [new ObjectId().toHexString(), 'not-an-id']) {
      const response = await request(app).post(`/api/sessions/${id}/heartbeat`).expect(404)
      expect(response.body).toMatchObject({ status: 404, detail: 'That session does not exist.' })
    }
  })

  it('refuses an ended or idle session with 409', async () => {
    for (const status of ['ended', 'idle'] as const) {
      const session = await insertSession(player, status)
      const response = await request(app)
        .post(`/api/sessions/${session._id.toHexString()}/heartbeat`)
        .expect(409)
      expect(response.body.status).toBe(409)
      expect(response.body.detail).toContain('Start a new game')
    }
  })
})

describe('DELETE /api/sessions/{id}', () => {
  it('ends the session and is safe to call twice', async () => {
    const session = await insertSession(player)
    const path = `/api/sessions/${session._id.toHexString()}`

    await request(app).delete(path).expect(204)
    const ended = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: session._id })
    expect(ended?.status).toBe('ended')

    await request(app).delete(path).expect(204)
  })

  it("refuses another player's session", async () => {
    const session = await insertSession(otherPlayer)

    const response = await request(app)
      .delete(`/api/sessions/${session._id.toHexString()}`)
      .expect(403)
    expect(response.body).toMatchObject({ detail: 'That session is not yours.' })
  })

  it('answers an unknown session with 404', async () => {
    const response = await request(app)
      .delete(`/api/sessions/${new ObjectId().toHexString()}`)
      .expect(404)
    expect(response.body).toMatchObject({ detail: 'That session does not exist.' })
  })
})

describe('GET /api/sessions/{id}', () => {
  it('returns the session', async () => {
    const created = await request(app)
      .post('/api/sessions')
      .send({ gameId: game._id.toHexString() })
      .expect(201)

    const response = await request(app)
      .get(`/api/sessions/${created.body.sessionId as string}`)
      .expect(200)

    expect(response.body).toMatchObject({
      id: created.body.sessionId,
      userId: player.toHexString(),
      gameId: game._id.toHexString(),
      status: 'running',
      lastAutosaveId: null,
    })
    expect(response.body.lastHeartbeatAt).toEqual(expect.any(String))
  })

  it("refuses another player's session", async () => {
    const session = await insertSession(otherPlayer)

    const response = await request(app)
      .get(`/api/sessions/${session._id.toHexString()}`)
      .expect(403)
    expect(response.body).toMatchObject({ detail: 'That session is not yours.' })
  })

  it('answers an unknown or malformed id with 404', async () => {
    for (const id of [new ObjectId().toHexString(), 'not-an-id']) {
      const response = await request(app).get(`/api/sessions/${id}`).expect(404)
      expect(response.body).toMatchObject({ detail: 'That session does not exist.' })
    }
  })
})

describe('PATCH /api/sessions/{id}', () => {
  it('pauses and then resumes the session', async () => {
    const session = await insertSession(player)
    const path = `/api/sessions/${session._id.toHexString()}`

    const paused = await request(app).patch(path).send({ status: 'paused' }).expect(200)
    expect(paused.body.status).toBe('paused')
    expect((await db.collection<SessionDocument>(SESSIONS_COLLECTION).findOne({ _id: session._id }))?.status).toBe('paused')

    const resumed = await request(app).patch(path).send({ status: 'running' }).expect(200)
    expect(resumed.body.status).toBe('running')
  })

  it('changes nothing when the status is already that one', async () => {
    const session = await insertSession(player, 'paused')

    const response = await request(app)
      .patch(`/api/sessions/${session._id.toHexString()}`)
      .send({ status: 'paused' })
      .expect(200)
    expect(response.body.status).toBe('paused')
  })

  it('answers an invalid status with 400 and the field', async () => {
    const session = await insertSession(player)

    const response = await request(app)
      .patch(`/api/sessions/${session._id.toHexString()}`)
      .send({ status: 'ended' })
      .expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body.errors).toHaveProperty('status')
  })

  it('refuses an ended or idle session with 409', async () => {
    for (const status of ['ended', 'idle'] as const) {
      const session = await insertSession(player, status)
      const response = await request(app)
        .patch(`/api/sessions/${session._id.toHexString()}`)
        .send({ status: 'paused' })
        .expect(409)
      expect(response.body.detail).toContain('Start a new game')
      expect((await db.collection<SessionDocument>(SESSIONS_COLLECTION).findOne({ _id: session._id }))?.status).toBe(status)
    }
  })

  it("refuses another player's session", async () => {
    const session = await insertSession(otherPlayer)

    const response = await request(app)
      .patch(`/api/sessions/${session._id.toHexString()}`)
      .send({ status: 'paused' })
      .expect(403)
    expect(response.body).toMatchObject({ detail: 'That session is not yours.' })
  })

  it('answers an unknown session with 404', async () => {
    const response = await request(app)
      .patch(`/api/sessions/${new ObjectId().toHexString()}`)
      .send({ status: 'paused' })
      .expect(404)
    expect(response.body).toMatchObject({ detail: 'That session does not exist.' })
  })
})
