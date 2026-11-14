import { type Db, type Filter, GridFSBucket, ObjectId } from 'mongodb'
import type { Readable } from 'node:stream'
import { type Save, type SaveKind, SaveSchema } from '@arcade-hub/contracts'
import { HttpError } from '../http/problem.ts'

/**
 * The GridFS bucket that holds save states. A `saves` document keeps only the
 * file's `_id` (see "MongoDB data model" in docs/spec.md).
 */
export const SAVE_STATE_BUCKET = 'saveStates'

/** The `saves` collection. */
export const SAVES_COLLECTION = 'saves'

export type SaveDocument = {
  _id: ObjectId
  userId: ObjectId
  gameId: ObjectId
  stateFileId: ObjectId
  kind: SaveKind
  createdAt: Date
}

function toSave(document: SaveDocument): Save {
  return SaveSchema.parse({
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    gameId: document.gameId.toHexString(),
    kind: document.kind,
    createdAt: document.createdAt.toISOString(),
  })
}

export type NewSave = {
  userId: ObjectId
  gameId: ObjectId
  kind: SaveKind
  /** The save state exactly as EmulatorJS produced it. */
  bytes: Buffer
}

/** POST /api/sessions/{id}/saves: the state goes into GridFS, the document points at it. */
export async function createSave(db: Db, input: NewSave): Promise<Save> {
  const bucket = new GridFSBucket(db, { bucketName: SAVE_STATE_BUCKET })
  const stateFileId = await upload(bucket, input.bytes)

  const document: SaveDocument = {
    _id: new ObjectId(),
    userId: input.userId,
    gameId: input.gameId,
    stateFileId,
    kind: input.kind,
    createdAt: new Date(),
  }
  try {
    await db.collection<SaveDocument>(SAVES_COLLECTION).insertOne(document)
  } catch (error) {
    // Don't leave a state in GridFS that no save points at.
    await bucket.delete(stateFileId)
    throw error
  }
  return toSave(document)
}

function upload(bucket: GridFSBucket, bytes: Buffer): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream('state')
    stream.once('error', reject)
    stream.once('finish', () => resolve(stream.id))
    stream.end(bytes)
  })
}

async function findSaveDocument(db: Db, id: string): Promise<SaveDocument> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'That save does not exist.')
  const document = await db
    .collection<SaveDocument>(SAVES_COLLECTION)
    .findOne({ _id: new ObjectId(id) })
  if (!document) throw new HttpError(404, 'That save does not exist.')
  return document
}

/** GET /api/saves?gameId=: this player's saves, newest first, optionally for one game. */
export async function listSaves(db: Db, userId: ObjectId, gameId?: string): Promise<Save[]> {
  const filter: Filter<SaveDocument> = { userId }
  if (gameId) filter.gameId = new ObjectId(gameId)

  const documents = await db
    .collection<SaveDocument>(SAVES_COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()
  return documents.map(toSave)
}

/** A save this player owns: 404 when unknown, 403 when it is someone else's. */
export async function findOwnedSave(db: Db, userId: ObjectId, id: string): Promise<Save> {
  const document = await findSaveDocument(db, id)
  if (!document.userId.equals(userId)) throw new HttpError(403, 'That save is not yours.')
  return toSave(document)
}

export type SaveFile = {
  /** Size of the state in bytes. */
  length: number
  /** The state's contents. The caller must consume or destroy it. */
  stream: Readable
}

/** GET /api/saves/{id}/file: the bytes EmulatorJS resumes from, for their owner only. */
export async function openSaveFile(db: Db, userId: ObjectId, id: string): Promise<SaveFile> {
  const document = await findSaveDocument(db, id)
  if (!document.userId.equals(userId)) throw new HttpError(403, 'That save is not yours.')

  const bucket = new GridFSBucket(db, { bucketName: SAVE_STATE_BUCKET })
  const file = await bucket.find({ _id: document.stateFileId }).next()
  if (!file) throw new HttpError(404, 'That save file does not exist.')
  return { length: file.length, stream: bucket.openDownloadStream(file._id) }
}
