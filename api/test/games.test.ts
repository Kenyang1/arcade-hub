import { ObjectId, type Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import type { GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'

// Needs a real MongoDB (docker compose up -d mongo). vitest.config.ts points the
// app at the arcadehub_test database, which is wiped before each test.
let db: Db
let bombSweeper: GameDocument
let caveEscape: GameDocument

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  bombSweeper = {
    _id: new ObjectId(),
    title: 'Bomb Sweeper',
    description: 'Clear the minefield without stepping on a bomb.',
    genre: 'Puzzle',
    core: 'nes',
    romFileId: new ObjectId(),
    createdAt: new Date('2026-10-30T12:00:00.000Z'),
  }
  caveEscape = {
    _id: new ObjectId(),
    title: 'Cave Escape',
    description: 'Find the way out of a cavern full of bats.',
    genre: 'Action',
    core: 'gb',
    romFileId: new ObjectId(),
    createdAt: new Date('2026-10-31T09:30:00.000Z'),
  }
  const games = db.collection<GameDocument>('games')
  await games.deleteMany({})
  await games.insertMany([caveEscape, bombSweeper])
})

afterAll(closeMongo)

describe('GET /api/games', () => {
  it('lists every game, sorted by title', async () => {
    const response = await request(app).get('/api/games').expect(200)
    expect(response.body.map((game: { title: string }) => game.title)).toEqual([
      'Bomb Sweeper',
      'Cave Escape',
    ])
    expect(response.body[0]).toEqual({
      id: bombSweeper._id.toHexString(),
      title: 'Bomb Sweeper',
      description: 'Clear the minefield without stepping on a bomb.',
      genre: 'Puzzle',
      core: 'nes',
      createdAt: '2026-10-30T12:00:00.000Z',
    })
  })

  it('searches part of a title, ignoring case', async () => {
    const response = await request(app).get('/api/games?search=BOMB').expect(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0].title).toBe('Bomb Sweeper')
  })

  it('filters by genre', async () => {
    const response = await request(app).get('/api/games?genre=Action').expect(200)
    expect(response.body.map((game: { title: string }) => game.title)).toEqual(['Cave Escape'])
  })

  it('treats a search term as text, not a regular expression', async () => {
    const response = await request(app).get('/api/games?search=.*').expect(200)
    expect(response.body).toEqual([])
  })

  it('answers a malformed query with ProblemDetails', async () => {
    const response = await request(app).get('/api/games?search=a&search=b').expect(400)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ status: 400 })
    expect(response.body.errors).toHaveProperty('search')
  })
})

describe('GET /api/games/{id}', () => {
  it('returns one game', async () => {
    const response = await request(app).get(`/api/games/${caveEscape._id.toHexString()}`).expect(200)
    expect(response.body).toMatchObject({ id: caveEscape._id.toHexString(), title: 'Cave Escape' })
  })

  it('answers an unknown or malformed id with ProblemDetails', async () => {
    for (const id of [new ObjectId().toHexString(), 'not-an-id']) {
      const response = await request(app).get(`/api/games/${id}`).expect(404)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.body).toMatchObject({ status: 404, detail: 'That game does not exist.' })
    }
  })
})
