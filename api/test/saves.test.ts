import { GridFSBucket, ObjectId, type Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { currentUser, signToken } from '../src/core/auth.ts'
import type { GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { SAVES_COLLECTION, SAVE_STATE_BUCKET, type SaveDocument } from '../src/core/saves.ts'
import { SESSIONS_COLLECTION, type SessionDocument } from '../src/core/sessions.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.

/** Stands in for an EmulatorJS save state. Never a real one: saves stay out of git. */
const state = Buffer.from([0x53, 0x54, 0x41, 0x54, 0x45, 0x01, 0x02, 0x03])

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
  await Promise.all([
    'games',
    'users',
    SESSIONS_COLLECTION,
    SAVES_COLLECTION,
    `${SAVE_STATE_BUCKET}.files`,
    `${SAVE_STATE_BUCKET}.chunks`,
  ].map((name) => db.collection(name).deleteMany({})))

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

async function startSession(userId: ObjectId = player, status: SessionDocument['status'] = 'running') {
  const session: SessionDocument = {
    _id: new ObjectId(),
    userId,
    gameId: game._id,
    status,
    lastHeartbeatAt: new Date(),
    lastAutosaveId: null,
  }
  await db.collection<SessionDocument>(SESSIONS_COLLECTION).insertOne(session)
  return session
}

/** Collects a binary body, so the response is compared byte for byte. */
function binaryParser(
  res: {
    on(event: 'data', listener: (chunk: Buffer) => void): void
    on(event: 'end', listener: () => void): void
  },
  done: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = []
  res.on('data', (chunk) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
}

describe('POST /api/sessions/{id}/saves', () => {
  it('stores a manual save as multipart form data', async () => {
    const session = await startSession()

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'manual')
      .attach('state', state, 'state.bin')
      .expect(201)

    expect(response.body).toMatchObject({
      kind: 'manual',
      gameId: game._id.toHexString(),
      userId: player.toHexString(),
    })
    expect(response.body.id).toEqual(expect.any(String))
    expect(response.body.createdAt).toEqual(expect.any(String))

    const saved = await db
      .collection<SaveDocument>(SAVES_COLLECTION)
      .findOne({ _id: new ObjectId(response.body.id as string) })
    expect(saved).toMatchObject({ kind: 'manual', gameId: game._id, userId: player })

    const bucket = new GridFSBucket(db, { bucketName: SAVE_STATE_BUCKET })
    const file = await bucket.find({ _id: saved?.stateFileId }).next()
    expect(file?.length).toBe(state.length)

    // A manual save is not the last autosave.
    const after = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: session._id })
    expect(after?.lastAutosaveId).toBeNull()
  })

  it('remembers an autosave on the session', async () => {
    const session = await startSession()

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'autosave')
      .attach('state', state, 'state.bin')
      .expect(201)

    const after = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: session._id })
    expect(after?.lastAutosaveId?.toHexString()).toBe(response.body.id)
  })

  it('answers a missing state file with 400', async () => {
    const session = await startSession()

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'manual')
      .expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ status: 400 })
    expect(response.body.errors).toHaveProperty('state')
  })

  it('answers an invalid kind with 400', async () => {
    const session = await startSession()

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'sometimes')
      .attach('state', state, 'state.bin')
      .expect(400)

    expect(response.body.errors).toHaveProperty('kind')
  })

  it('refuses an empty state', async () => {
    const session = await startSession()

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'manual')
      .attach('state', Buffer.alloc(0), 'state.bin')
      .expect(400)

    expect(response.body.detail).toMatch(/empty|required/i)
  })

  it('refuses an ended session with 409', async () => {
    const session = await startSession(player, 'ended')

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'autosave')
      .attach('state', state, 'state.bin')
      .expect(409)

    expect(response.body).toMatchObject({ status: 409 })
  })

  it("refuses another player's session", async () => {
    const session = await startSession(otherPlayer)

    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .field('kind', 'manual')
      .attach('state', state, 'state.bin')
      .expect(403)

    expect(response.body).toMatchObject({ detail: 'That session is not yours.' })
  })

  it('answers an unknown session with 404', async () => {
    const response = await request(app)
      .post(`/api/sessions/${new ObjectId().toHexString()}/saves`)
      .field('kind', 'manual')
      .attach('state', state, 'state.bin')
      .expect(404)

    expect(response.body).toMatchObject({ detail: 'That session does not exist.' })
  })
})

describe('GET /api/saves/{id}/file', () => {
  async function uploadSave(userId: ObjectId = player): Promise<string> {
    const session = await startSession(userId)
    const response = await request(app)
      .post(`/api/sessions/${session._id.toHexString()}/saves`)
      .set('Authorization', `Bearer ${signToken(userId.toHexString())}`)
      .field('kind', 'manual')
      .attach('state', state, 'state.bin')
      .expect(201)
    return response.body.id as string
  }

  it('streams the state back byte for byte', async () => {
    const saveId = await uploadSave()

    const response = await request(app)
      .get(`/api/saves/${saveId}/file`)
      .set('Authorization', `Bearer ${signToken(player.toHexString())}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)

    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-length']).toBe(String(state.length))
    expect(Buffer.compare(response.body as Buffer, state)).toBe(0)
  })

  it("refuses another player's save with 403", async () => {
    const saveId = await uploadSave(otherPlayer)
    const otherToken = signToken(new ObjectId().toHexString())

    const response = await request(app)
      .get(`/api/saves/${saveId}/file`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)

    expect(response.body).toMatchObject({ detail: 'That save is not yours.' })
  })

  it('answers an unknown or malformed id with 404', async () => {
    for (const id of [new ObjectId().toHexString(), 'not-an-id']) {
      const response = await request(app).get(`/api/saves/${id}/file`).expect(404)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.body).toMatchObject({ detail: 'That save does not exist.' })
    }
  })

  it('answers 404 when the state is gone from GridFS', async () => {
    const saveId = await uploadSave()
    const saved = await db
      .collection<SaveDocument>(SAVES_COLLECTION)
      .findOne({ _id: new ObjectId(saveId) })
    const bucket = new GridFSBucket(db, { bucketName: SAVE_STATE_BUCKET })
    if (saved) await bucket.delete(saved.stateFileId)

    const response = await request(app).get(`/api/saves/${saveId}/file`).expect(404)
    expect(response.body).toMatchObject({ detail: 'That save file does not exist.' })
  })
})

describe('GET /api/saves', () => {
  async function insertSave(
    userId: ObjectId,
    createdAt: string,
    gameId: ObjectId = game._id,
    kind: SaveDocument['kind'] = 'manual',
  ): Promise<SaveDocument> {
    const save: SaveDocument = {
      _id: new ObjectId(),
      userId,
      gameId,
      stateFileId: new ObjectId(),
      kind,
      createdAt: new Date(createdAt),
    }
    await db.collection<SaveDocument>(SAVES_COLLECTION).insertOne(save)
    return save
  }

  it("lists the player's saves, newest first", async () => {
    const older = await insertSave(player, '2026-11-01T10:00:00.000Z')
    const newer = await insertSave(player, '2026-11-02T10:00:00.000Z', game._id, 'autosave')
    await insertSave(otherPlayer, '2026-11-03T10:00:00.000Z')

    const response = await request(app).get('/api/saves').expect(200)

    expect(response.body.map((save: { id: string }) => save.id)).toEqual([
      newer._id.toHexString(),
      older._id.toHexString(),
    ])
    expect(response.body[0]).toMatchObject({
      userId: player.toHexString(),
      gameId: game._id.toHexString(),
      kind: 'autosave',
      createdAt: '2026-11-02T10:00:00.000Z',
    })
  })

  it('narrows the list to one game', async () => {
    const otherGame = new ObjectId()
    const wanted = await insertSave(player, '2026-11-01T10:00:00.000Z')
    await insertSave(player, '2026-11-02T10:00:00.000Z', otherGame)

    const response = await request(app)
      .get(`/api/saves?gameId=${game._id.toHexString()}`)
      .expect(200)

    expect(response.body.map((save: { id: string }) => save.id)).toEqual([
      wanted._id.toHexString(),
    ])
  })

  it('answers a malformed gameId with 400', async () => {
    const response = await request(app).get('/api/saves?gameId=not-an-id').expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body.errors).toHaveProperty('gameId')
  })

  it('answers a repeated gameId with 400', async () => {
    const response = await request(app)
      .get(`/api/saves?gameId=${game._id.toHexString()}&gameId=${game._id.toHexString()}`)
      .expect(400)

    expect(response.body.errors).toHaveProperty('gameId')
  })
})
