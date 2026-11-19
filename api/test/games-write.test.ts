import type { Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { config } from '../src/config.ts'
import { GAME_FILE_BUCKET, type GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.
// The game file is a fake few bytes: no real game file goes in git.

const GAME_BYTES = Buffer.from('NES\x1a a fake game file that only these tests read')

let db: Db

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await db.collection<GameDocument>('games').deleteMany({})
  await db.collection(`${GAME_FILE_BUCKET}.files`).deleteMany({})
  await db.collection(`${GAME_FILE_BUCKET}.chunks`).deleteMany({})
})

afterAll(closeMongo)

async function withConfig(change: Partial<typeof config>, run: () => Promise<void>): Promise<void> {
  const before = { ...config }
  Object.assign(config, change)
  try {
    await run()
  } finally {
    Object.assign(config, before)
  }
}

/** POST /api/games with the details as fields and the game file as the file part. */
function addGame(fields: Record<string, string> = {}, filename = 'bomb-sweeper.nes') {
  const form: Record<string, string> = {
    title: 'Bomb Sweeper',
    description: 'Clear the minefield without stepping on a bomb.',
    genre: 'Puzzle',
    core: 'nes',
    ...fields,
  }
  const call = request(app).post('/api/games')
  for (const [name, value] of Object.entries(form)) call.field(name, value)
  return call.attach('file', GAME_BYTES, filename)
}

const storedFiles = () => db.collection(`${GAME_FILE_BUCKET}.files`).countDocuments()

describe('POST /api/games', () => {
  it('adds the game and its file, and streams the file back', async () => {
    const created = await addGame().expect(201)

    expect(created.body).toMatchObject({
      title: 'Bomb Sweeper',
      description: 'Clear the minefield without stepping on a bomb.',
      genre: 'Puzzle',
      core: 'nes',
    })
    expect(Object.keys(created.body).sort()).toEqual([
      'core',
      'createdAt',
      'description',
      'genre',
      'id',
      'title',
    ])

    const stored = await db.collection<GameDocument>('games').findOne({})
    expect(stored?.romFileId).toBeDefined()
    expect(await storedFiles()).toBe(1)

    const file = await request(app).get(`/api/games/${created.body.id}/file`).expect(200)
    expect(file.headers['content-type']).toBe('application/octet-stream')
    expect(Number(file.headers['content-length'])).toBe(GAME_BYTES.length)
    expect(Buffer.from(file.body).equals(GAME_BYTES)).toBe(true)

    // The game is in the catalog straight away.
    const list = await request(app).get('/api/games').expect(200)
    expect(list.body.map((game: { title: string }) => game.title)).toEqual(['Bomb Sweeper'])
  })

  it('answers 409 for a title the catalog already has, storing nothing', async () => {
    await addGame().expect(201)

    const duplicate = await addGame({ genre: 'Action' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.headers['content-type']).toContain('application/problem+json')
    expect(duplicate.body.detail).toBe('A game with that title already exists.')
    expect(await db.collection<GameDocument>('games').countDocuments()).toBe(1)
    // The rejected file never reached GridFS.
    expect(await storedFiles()).toBe(1)
  })

  it('answers 400 when the game file is missing', async () => {
    const response = await request(app)
      .post('/api/games')
      .field('title', 'Bomb Sweeper')
      .field('description', 'Clear the minefield.')
      .field('genre', 'Puzzle')
      .field('core', 'nes')

    expect(response.status).toBe(400)
    expect(response.body.errors).toHaveProperty('file')
    expect(await db.collection<GameDocument>('games').countDocuments()).toBe(0)
  })

  it('answers 400 when the file is not for the chosen console', async () => {
    const response = await addGame({ core: 'nes' }, 'bomb-sweeper.gba')

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('A NES game file ends in .nes.')
    expect(response.body.errors).toHaveProperty('file')
    expect(await storedFiles()).toBe(0)
  })

  it('answers 400 for an empty file', async () => {
    const response = await request(app)
      .post('/api/games')
      .field('title', 'Bomb Sweeper')
      .field('description', 'Clear the minefield.')
      .field('genre', 'Puzzle')
      .field('core', 'nes')
      .attach('file', Buffer.alloc(0), 'bomb-sweeper.nes')

    expect(response.status).toBe(400)
    expect(response.body.detail).toBe('That game file is empty.')
  })

  it('refuses a caller who is not signed in before reading the upload', async () => {
    await withConfig({ allowStandInUser: false }, async () => {
      const response = await addGame()
      expect(response.status).toBe(401)
      expect(response.headers['content-type']).toContain('application/problem+json')
    })
    expect(await db.collection<GameDocument>('games').countDocuments()).toBe(0)
    expect(await storedFiles()).toBe(0)
  })
})

describe('PUT /api/games/{id}', () => {
  it('changes the details and leaves the game file alone', async () => {
    const created = await addGame().expect(201)

    const edited = await request(app)
      .put(`/api/games/${created.body.id}`)
      .send({
        title: 'Bomb Sweeper Deluxe',
        description: 'The same minefield, more bombs.',
        genre: 'Action',
        core: 'nes',
      })
      .expect(200)

    expect(edited.body).toMatchObject({
      id: created.body.id,
      title: 'Bomb Sweeper Deluxe',
      genre: 'Action',
      createdAt: created.body.createdAt,
    })
    expect(await storedFiles()).toBe(1)
    await request(app).get(`/api/games/${created.body.id}/file`).expect(200)
  })

  it('answers 409 when the new title belongs to another game', async () => {
    const first = await addGame().expect(201)
    await addGame({ title: 'Cave Escape', genre: 'Action', core: 'gb' }, 'cave-escape.gb').expect(201)

    const response = await request(app)
      .put(`/api/games/${first.body.id}`)
      .send({
        title: 'Cave Escape',
        description: 'Clear the minefield.',
        genre: 'Puzzle',
        core: 'nes',
      })

    expect(response.status).toBe(409)
    expect(response.body.detail).toBe('A game with that title already exists.')
  })

  it('answers 404 for an unknown or malformed id', async () => {
    for (const id of ['000000000000000000000000', 'not-an-id']) {
      const response = await request(app)
        .put(`/api/games/${id}`)
        .send({ title: 'Bomb Sweeper', description: 'Clear it.', genre: 'Puzzle', core: 'nes' })
      expect(response.status).toBe(404)
    }
  })
})

describe('DELETE /api/games/{id}', () => {
  it('removes the game and its file', async () => {
    const created = await addGame().expect(201)

    await request(app).delete(`/api/games/${created.body.id}`).expect(204)

    expect(await db.collection<GameDocument>('games').countDocuments()).toBe(0)
    expect(await storedFiles()).toBe(0)
    await request(app).get(`/api/games/${created.body.id}`).expect(404)
    await request(app).get(`/api/games/${created.body.id}/file`).expect(404)

    // Deleting it again is a 404, not a second delete of something else.
    await request(app).delete(`/api/games/${created.body.id}`).expect(404)
  })

  it('answers 404 for an unknown or malformed id', async () => {
    for (const id of ['000000000000000000000000', 'not-an-id']) {
      await request(app).delete(`/api/games/${id}`).expect(404)
    }
  })
})
