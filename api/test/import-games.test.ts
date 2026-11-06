import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Db } from 'mongodb'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { GAME_FILE_BUCKET } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { importGames } from '../src/jobs/import-games.ts'

// Needs a real MongoDB (docker compose up -d mongo), like the other API tests.

/** An 8-byte NES file: the header a real game starts with. */
const rom = Buffer.from([0x4e, 0x45, 0x53, 0x1a, 0x02, 0x01, 0x00, 0x00])

let db: Db
let folder: string

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
  folder = await mkdtemp(join(tmpdir(), 'import-games-'))
  await writeFile(join(folder, 'bomb-sweeper.nes'), rom)
  await writeFile(
    join(folder, 'games.json'),
    JSON.stringify([
      {
        file: 'bomb-sweeper.nes',
        title: 'Bomb Sweeper',
        description: 'Clear the minefield without stepping on a bomb.',
        genre: 'Puzzle',
        core: 'nes',
      },
    ]),
  )
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

afterAll(closeMongo)

describe('import-games', () => {
  it('changes nothing in a dry run', async () => {
    const result = await importGames(db, folder, false)
    expect(result.imported).toEqual(['Bomb Sweeper'])
    expect(await db.collection('games').countDocuments()).toBe(0)
    expect(await db.collection(`${GAME_FILE_BUCKET}.files`).countDocuments()).toBe(0)
  })

  it('imports once, and a second run imports 0', async () => {
    expect((await importGames(db, folder, true)).imported).toEqual(['Bomb Sweeper'])
    const second = await importGames(db, folder, true)
    expect(second.imported).toEqual([])
    expect(second.skipped).toEqual(['Bomb Sweeper'])
    expect(await db.collection('games').countDocuments()).toBe(1)
    expect(await db.collection(`${GAME_FILE_BUCKET}.files`).countDocuments()).toBe(1)
  })

  it('imports a game the catalog and the file endpoint can serve', async () => {
    await importGames(db, folder, true)

    const list = await request(app).get('/api/games').expect(200)
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({ title: 'Bomb Sweeper', core: 'nes', genre: 'Puzzle' })

    const file = await request(app)
      .get(`/api/games/${list.body[0].id}/file`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => done(null, Buffer.concat(chunks)))
      })
      .expect(200)
    expect(Buffer.compare(file.body as Buffer, rom)).toBe(0)
  })

  it('fails before writing anything when a game file is missing', async () => {
    await rm(join(folder, 'bomb-sweeper.nes'))
    await expect(importGames(db, folder, false)).rejects.toThrow(/ENOENT/)
    expect(await db.collection('games').countDocuments()).toBe(0)
  })

  it('rejects a manifest that lists a title twice', async () => {
    const entry = { file: 'bomb-sweeper.nes', title: 'Bomb Sweeper', description: '', genre: 'Puzzle', core: 'nes' }
    await writeFile(join(folder, 'games.json'), JSON.stringify([entry, entry]))
    await expect(importGames(db, folder, true)).rejects.toThrow(/more than once/)
  })
})
