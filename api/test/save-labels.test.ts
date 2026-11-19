import { ObjectId, type Db } from 'mongodb'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VisionModel } from '../src/core/ai.ts'
import { app } from '../src/app.ts'
import { currentUser } from '../src/core/auth.ts'
import type { GameDocument } from '../src/core/games.ts'
import { closeMongo, connectMongo } from '../src/core/mongo.ts'
import { SAVES_COLLECTION, SAVE_STATE_BUCKET, type SaveDocument, labelSave } from '../src/core/saves.ts'
import { SESSIONS_COLLECTION, type SessionDocument } from '../src/core/sessions.ts'

// AI labels on uploaded saves (docs/plans/2026-11-10-ai-integration.md).
// Needs a real MongoDB, like saves.test.ts. No test calls a real AI provider:
// the route's model is swapped for a fake below.

/** The model the route uses. Each test sets it; null means the AI is off. */
let model: VisionModel | null = null

vi.mock('../src/core/ai.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/core/ai.ts')>()
  return { ...original, defaultVisionModel: () => model }
})

/** Stands in for an EmulatorJS save state. Never a real one: saves stay out of git. */
const state = Buffer.from([0x53, 0x54, 0x41, 0x54, 0x45, 0x01, 0x02, 0x03])
/** A PNG signature and the start of a header: enough for labelFrame's checks. */
const frame = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])

let db: Db
let game: GameDocument
let player: ObjectId

beforeAll(async () => {
  db = await connectMongo()
  if (!db.databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run against "${db.databaseName}": tests need a database ending in _test.`)
  }
})

beforeEach(async () => {
  await Promise.all(
    ['games', 'users', SESSIONS_COLLECTION, SAVES_COLLECTION, `${SAVE_STATE_BUCKET}.files`, `${SAVE_STATE_BUCKET}.chunks`].map(
      (name) => db.collection(name).deleteMany({}),
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
  model = null
})

afterAll(closeMongo)

async function startSession(): Promise<SessionDocument> {
  const session: SessionDocument = {
    _id: new ObjectId(),
    userId: player,
    gameId: game._id,
    status: 'running',
    lastHeartbeatAt: new Date(),
    lastAutosaveId: null,
  }
  await db.collection<SessionDocument>(SESSIONS_COLLECTION).insertOne(session)
  return session
}

/** A fake model that answers with this label and confidence. */
function answering(label: string | null, confidence = 0.9) {
  return vi.fn<VisionModel>(async () => JSON.stringify({ label, confidence }))
}

function upload(session: SessionDocument, withFrame = true) {
  const call = request(app)
    .post(`/api/sessions/${session._id.toHexString()}/saves`)
    .field('kind', 'manual')
    .attach('state', state, 'state.bin')
  return withFrame ? call.attach('frame', frame, 'frame.png') : call
}

async function storedLabel(id: string): Promise<string | undefined> {
  const saved = await db.collection<SaveDocument>(SAVES_COLLECTION).findOne({ _id: new ObjectId(id) })
  return saved?.label
}

/** Lets the labelling that runs after the response finish, when nothing is expected of it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

describe('labels on uploaded saves', () => {
  it('labels a save from its frame, after answering the upload', async () => {
    model = answering('Level 3, 1:20 left')
    const response = await upload(await startSession()).expect(201)

    // The label is never in the upload's own response.
    expect(response.body.label).toBeUndefined()
    await vi.waitFor(async () => expect(await storedLabel(response.body.id as string)).toBe('Level 3, 1:20 left'))

    const list = await request(app).get('/api/saves').expect(200)
    expect(list.body).toEqual([expect.objectContaining({ id: response.body.id, label: 'Level 3, 1:20 left' })])
    const sent = vi.mocked(model).mock.calls[0]?.[0]
    expect(sent?.png).toEqual(frame)
    expect(sent?.prompt).toContain('Bomb Sweeper')
  })

  it('stores the save without a label when the AI is off', async () => {
    const response = await upload(await startSession()).expect(201)
    await settle()
    expect(await storedLabel(response.body.id as string)).toBeUndefined()
  })

  it('stores the save without a label when the AI call fails', async () => {
    model = vi.fn<VisionModel>(async () => {
      throw Object.assign(new Error('Resource has been exhausted'), { status: 429 })
    })
    const response = await upload(await startSession()).expect(201)
    await vi.waitFor(() => expect(model).toHaveBeenCalled())
    await settle()
    expect(await storedLabel(response.body.id as string)).toBeUndefined()
  })

  it('does not call the AI for a save without a frame', async () => {
    model = answering('Level 3')
    const response = await upload(await startSession(), false).expect(201)
    await settle()
    expect(model).not.toHaveBeenCalled()
    expect(await storedLabel(response.body.id as string)).toBeUndefined()
  })
})

describe('labelSave', () => {
  async function insertSave(label?: string): Promise<ObjectId> {
    const document: SaveDocument = {
      _id: new ObjectId(),
      userId: player,
      gameId: game._id,
      stateFileId: new ObjectId(),
      kind: 'manual',
      createdAt: new Date(),
      ...(label ? { label } : {}),
    }
    await db.collection<SaveDocument>(SAVES_COLLECTION).insertOne(document)
    return document._id
  }

  it('keeps a label the save already has', async () => {
    const id = await insertSave('Level 1')
    await expect(labelSave(db, id, frame, { title: game.title }, answering('Level 9'))).resolves.toBeNull()
    expect(await storedLabel(id.toHexString())).toBe('Level 1')
  })

  it('stores no label when the model is not sure', async () => {
    const id = await insertSave()
    await expect(labelSave(db, id, frame, { title: game.title }, answering('Level 9', 0.2))).resolves.toBeNull()
    expect(await storedLabel(id.toHexString())).toBeUndefined()
  })
})
