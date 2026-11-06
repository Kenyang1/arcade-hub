import { GridFSBucket, type Db, type Filter, ObjectId } from 'mongodb'
import type { Readable } from 'node:stream'
import { type Game, type GameQuery, GameSchema } from '@arcade-hub/contracts'

/**
 * The GridFS bucket that holds game files, one file per game. `import-games`
 * writes here, and `games.romFileId` is the file's `_id` (see docs/spec.md).
 */
export const GAME_FILE_BUCKET = 'gameFiles'

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
    .collection<GameDocument>('games')
    .find(filter)
    .sort({ title: 1 })
    .toArray()
  return documents.map(toGame)
}

/** GET /api/games/{id}: null when no game has that id. */
export async function findGame(db: Db, id: string): Promise<Game | null> {
  if (!ObjectId.isValid(id)) return null
  const document = await db.collection<GameDocument>('games').findOne({ _id: new ObjectId(id) })
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
    .collection<GameDocument>('games')
    .findOne({ _id: new ObjectId(id) }, { projection: { romFileId: 1 } })
  if (!document?.romFileId) return null

  const bucket = new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET })
  const file = await bucket.find({ _id: document.romFileId }).next()
  if (!file) return null
  return { length: file.length, stream: bucket.openDownloadStream(file._id) }
}
