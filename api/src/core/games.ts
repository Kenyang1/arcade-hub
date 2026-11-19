import { GridFSBucket, type Db, type Filter, ObjectId } from 'mongodb'
import type { Readable } from 'node:stream'
import { type Game, type GameInput, type GameQuery, GameSchema } from '@arcade-hub/contracts'
import { HttpError } from '../http/problem.ts'
import { logger } from '../logger.ts'

/**
 * The GridFS bucket that holds game files, one file per game. `import-games`
 * writes here, and `games.romFileId` is the file's `_id` (see docs/spec.md).
 */
export const GAME_FILE_BUCKET = 'gameFiles'

/** The `games` collection. `import-games` and the write routes both use it. */
export const GAMES_COLLECTION = 'games'

/**
 * A document in the `games` collection (see "MongoDB data model" in docs/spec.md).
 * `import-games` writes these, and the game file lives in GridFS under `romFileId`.
 * The API maps `_id` to the contract's string `id`.
 */
export type GameDocument = {
  _id: ObjectId
  title: string
  description: string
  genre: string
  core: Game['core']
  romFileId: ObjectId
  createdAt: Date
}

function toGame(document: GameDocument): Game {
  return GameSchema.parse({
    id: document._id.toHexString(),
    title: document.title,
    description: document.description,
    genre: document.genre,
    core: document.core,
    createdAt: document.createdAt.toISOString(),
  })
}

/** A search term is matched as text, never as a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** GET /api/games: every game, or the ones matching the search and genre. */
export async function listGames(db: Db, query: GameQuery): Promise<Game[]> {
  const filter: Filter<GameDocument> = {}
  const search = query.search?.trim()
  if (search) filter.title = { $regex: escapeRegExp(search), $options: 'i' }
  if (query.genre) filter.genre = query.genre

  const documents = await db
    .collection<GameDocument>(GAMES_COLLECTION)
    .find(filter)
    .sort({ title: 1 })
    .toArray()
  return documents.map(toGame)
}

/** GET /api/games/{id}: null when no game has that id. */
export async function findGame(db: Db, id: string): Promise<Game | null> {
  if (!ObjectId.isValid(id)) return null
  const document = await db.collection<GameDocument>(GAMES_COLLECTION).findOne({ _id: new ObjectId(id) })
  return document ? toGame(document) : null
}

export type GameFile = {
  /** Size of the file in bytes. */
  length: number
  /** The file's contents. The caller must consume or destroy it. */
  stream: Readable
}

/**
 * The file behind GET /api/games/{id}/file. Null when no game has that id, or
 * when the file the game points at is no longer in GridFS.
 */
export async function openGameFile(db: Db, id: string): Promise<GameFile | null> {
  if (!ObjectId.isValid(id)) return null
  const document = await db
    .collection<GameDocument>(GAMES_COLLECTION)
    .findOne({ _id: new ObjectId(id) }, { projection: { romFileId: 1 } })
  if (!document?.romFileId) return null

  const bucket = new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET })
  const file = await bucket.find({ _id: document.romFileId }).next()
  if (!file) return null
  return { length: file.length, stream: bucket.openDownloadStream(file._id) }
}

/** The file extensions each console takes (the same list as web/src/lib/gameFile.ts). */
const GAME_FILE_EXTENSIONS: Record<Game['core'], string[]> = {
  nes: ['.nes'],
  snes: ['.sfc', '.smc'],
  gb: ['.gb', '.gbc'],
  gba: ['.gba'],
}

/**
 * A plain message when the file can't be a game for this console, or null when
 * the name looks right. Only the name is checked: the bytes are the emulator's
 * business.
 */
export function gameFileProblem(filename: string, core: Game['core']): string | null {
  const extensions = GAME_FILE_EXTENSIONS[core]
  const name = filename.toLowerCase()
  if (!extensions.some((extension) => name.endsWith(extension))) {
    return `A ${core.toUpperCase()} game file ends in ${extensions.join(' or ')}.`
  }
  return null
}

export type NewGame = GameInput & {
  /** The uploaded file's name, kept in GridFS so the file can be identified. */
  filename: string
  /** The game file exactly as it was uploaded. */
  bytes: Buffer
}

const DUPLICATE_TITLE = 'A game with that title already exists.'

/**
 * POST /api/games: the game file goes into GridFS and the document points at
 * it, the same shape `import-games` writes. A duplicate title is a 409; the
 * unique index on `games.title` settles two adds at once.
 */
export async function createGame(db: Db, input: NewGame): Promise<Game> {
  const games = db.collection<GameDocument>(GAMES_COLLECTION)
  if (await games.findOne({ title: input.title }, { projection: { _id: 1 } })) {
    throw new HttpError(409, DUPLICATE_TITLE)
  }

  const bucket = new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET })
  const romFileId = await upload(bucket, input.filename, input.bytes)
  const document: GameDocument = {
    _id: new ObjectId(),
    title: input.title,
    description: input.description,
    genre: input.genre,
    core: input.core,
    romFileId,
    createdAt: new Date(),
  }
  try {
    await games.insertOne(document)
  } catch (error) {
    // Don't leave a file in GridFS that no game points at.
    await bucket.delete(romFileId)
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, DUPLICATE_TITLE)
    throw error
  }
  return toGame(document)
}

function upload(bucket: GridFSBucket, filename: string, bytes: Buffer): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename)
    stream.once('error', reject)
    stream.once('finish', () => resolve(stream.id))
    stream.end(bytes)
  })
}

/** PUT /api/games/{id}: the details change, the game file stays. */
export async function updateGame(db: Db, id: string, input: GameInput): Promise<Game> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'That game does not exist.')
  const games = db.collection<GameDocument>(GAMES_COLLECTION)
  const _id = new ObjectId(id)

  const clash = await games.findOne({ title: input.title, _id: { $ne: _id } }, { projection: { _id: 1 } })
  if (clash) throw new HttpError(409, DUPLICATE_TITLE)

  try {
    const document = await games.findOneAndUpdate({ _id }, { $set: input }, { returnDocument: 'after' })
    if (!document) throw new HttpError(404, 'That game does not exist.')
    return toGame(document)
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, DUPLICATE_TITLE)
    throw error
  }
}

/**
 * DELETE /api/games/{id}: the document goes first, because the catalog is what
 * players read, and the file follows. A file that can't be removed leaves an
 * orphan in GridFS, which is logged rather than turned into a failed delete.
 */
export async function deleteGame(db: Db, id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'That game does not exist.')
  const games = db.collection<GameDocument>(GAMES_COLLECTION)
  const document = await games.findOne({ _id: new ObjectId(id) })
  if (!document) throw new HttpError(404, 'That game does not exist.')

  await games.deleteOne({ _id: document._id })
  try {
    await new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET }).delete(document.romFileId)
  } catch (error) {
    logger.warn({ err: error, gameId: id }, 'deleted a game but not its file')
  }
}
