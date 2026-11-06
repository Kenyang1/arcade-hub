import { GridFSBucket, ObjectId, type Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { GAME_FILE_BUCKET, type GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.

/** An 8-byte NES file: the header a real game starts with. */
const rom = Buffer.from([0x4e, 0x45, 0x53, 0x1a, 0x02, 0x01, 0x00, 0x00])

let db: Db
let bucket: GridFSBucket
let bombSweeper: GameDocument

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await db.collection('games').deleteMany({})
  await db.collection(`${GAME_FILE_BUCKET}.files`).deleteMany({})
  await db.collection(`${GAME_FILE_BUCKET}.chunks`).deleteMany({})
  bucket = new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET })

  bombSweeper = {
    _id: new ObjectId(),
    title: 'Bomb Sweeper',
    description: 'Clear the minefield without stepping on a bomb.',
    genre: 'Puzzle',
    core: 'nes',
    romFileId: await uploadRom('bomb-sweeper.nes', rom),
    createdAt: new Date('2026-10-30T12:00:00.000Z'),
  }
  await db.collection<GameDocument>('games').insertOne(bombSweeper)
})

afterAll(closeMongo)

function uploadRom(filename: string, bytes: Buffer): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = bucket.openUploadStream(filename)
    upload.on('error', reject)
    upload.on('finish', () => resolve(upload.id))
    upload.end(bytes)
  })
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

describe('GET /api/games/{id}/file', () => {
  it('streams the game file without asking for a token', async () => {
    const response = await request(app)
      .get(`/api/games/${bombSweeper._id.toHexString()}/file`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)

    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-length']).toBe(String(rom.length))
    expect(Buffer.compare(response.body as Buffer, rom)).toBe(0)
  })

  it('answers an unknown or malformed id with ProblemDetails', async () => {
    for (const id of [new ObjectId().toHexString(), 'not-an-id']) {
      const response = await request(app).get(`/api/games/${id}/file`).expect(404)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.body).toMatchObject({ status: 404, detail: 'That game file does not exist.' })
    }
  })

  it('answers 404 when the game file is gone from GridFS', async () => {
    await bucket.delete(bombSweeper.romFileId)

    const response = await request(app)
      .get(`/api/games/${bombSweeper._id.toHexString()}/file`)
      .expect(404)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ detail: 'That game file does not exist.' })
  })
})
