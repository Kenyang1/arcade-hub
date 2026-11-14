import { ObjectId, type Db } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  currentUser,
  DEV_USERNAME,
  USERS_COLLECTION,
  type UserDocument,
} from '../src/core/auth.ts'
import { ensureIndexes } from '../src/core/indexes.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { SAVES_COLLECTION, type SaveDocument } from '../src/core/saves.ts'
import { SESSIONS_COLLECTION, type SessionDocument } from '../src/core/sessions.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.
// Sign-in lands in M3, so requests with no token play as the stand-in account.

let db: Db

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await Promise.all(
    [USERS_COLLECTION, SESSIONS_COLLECTION, SAVES_COLLECTION].map((name) =>
      db.collection(name).deleteMany({}),
    ),
  )
})

afterAll(closeMongo)

function user(id: ObjectId, createdAt: string): UserDocument {
  return { _id: id, username: DEV_USERNAME, passwordHash: 'salt:hash', createdAt: new Date(createdAt) }
}

describe('the unique index on users.username', () => {
  it('exists once the API is connected', async () => {
    expect(await db.collection(USERS_COLLECTION).indexExists('username_1')).toBe(true)
    const indexes = await db.collection(USERS_COLLECTION).indexes()
    expect(indexes.find((index) => index.name === 'username_1')?.unique).toBe(true)
  })

  it('gives parallel requests on an empty database one account', async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => currentUser(db, undefined)))

    const accounts = await db.collection<UserDocument>(USERS_COLLECTION).find({}).toArray()
    expect(accounts).toHaveLength(1)
    expect(new Set(ids.map((id) => id.toHexString())).size).toBe(1)
    expect(ids[0]?.toHexString()).toBe(accounts[0]?._id.toHexString())
  })

  it('refuses a second account with the same username', async () => {
    await db.collection<UserDocument>(USERS_COLLECTION).insertOne(user(new ObjectId(), '2026-11-01T00:00:00.000Z'))

    await expect(
      db.collection<UserDocument>(USERS_COLLECTION).insertOne(user(new ObjectId(), '2026-11-02T00:00:00.000Z')),
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('merges duplicates that predate the index, keeping the oldest account', async () => {
    // A database from before this fix: no index, several copies of the account.
    await db.collection(USERS_COLLECTION).dropIndex('username_1')
    const oldest = new ObjectId()
    const extra = new ObjectId()
    await db
      .collection<UserDocument>(USERS_COLLECTION)
      .insertMany([user(oldest, '2026-11-01T00:00:00.000Z'), user(extra, '2026-11-02T00:00:00.000Z')])

    const session: SessionDocument = {
      _id: new ObjectId(),
      userId: extra,
      gameId: new ObjectId(),
      status: 'running',
      lastHeartbeatAt: new Date(),
      lastAutosaveId: null,
    }
    const save: SaveDocument = {
      _id: new ObjectId(),
      userId: extra,
      gameId: session.gameId,
      stateFileId: new ObjectId(),
      kind: 'manual',
      createdAt: new Date(),
    }
    await db.collection<SessionDocument>(SESSIONS_COLLECTION).insertOne(session)
    await db.collection<SaveDocument>(SAVES_COLLECTION).insertOne(save)

    await ensureIndexes(db)

    const accounts = await db.collection<UserDocument>(USERS_COLLECTION).find({}).toArray()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?._id.toHexString()).toBe(oldest.toHexString())

    // The history of the dropped copy belongs to the account that kept the name.
    const movedSession = await db
      .collection<SessionDocument>(SESSIONS_COLLECTION)
      .findOne({ _id: session._id })
    const movedSave = await db.collection<SaveDocument>(SAVES_COLLECTION).findOne({ _id: save._id })
    expect(movedSession?.userId.toHexString()).toBe(oldest.toHexString())
    expect(movedSave?.userId.toHexString()).toBe(oldest.toHexString())

    expect(await db.collection(USERS_COLLECTION).indexExists('username_1')).toBe(true)
  })
})
