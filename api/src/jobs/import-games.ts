import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type Db, GridFSBucket, ObjectId } from 'mongodb'
import { z } from 'zod'
import { EmulatorCoreSchema } from '@arcade-hub/contracts'
import { GAME_FILE_BUCKET, type GameDocument } from '../core/games.ts'

/** <folder>/games.json: one entry per game file in the same folder. */
export const ManifestSchema = z.array(
  z.object({
    file: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    genre: z.string().min(1),
    core: EmulatorCoreSchema,
  }),
)

export type ImportResult = {
  /** Titles added (or, in a dry run, that would be added). */
  imported: string[]
  /** Titles skipped because the catalog already has them. */
  skipped: string[]
}

/**
 * Adds every game in <folder>/games.json that isn't in the catalog yet, matched
 * by title. The file goes to the GridFS bucket the file endpoint reads from,
 * and the game document points at it with `romFileId`. Dry run unless `apply`
 * is true. Safe to run twice: the second run imports 0.
 */
export async function importGames(db: Db, folder: string, apply: boolean): Promise<ImportResult> {
  const manifestPath = join(folder, 'games.json')
  const manifest = ManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))

  const titles = manifest.map((entry) => entry.title)
  const duplicate = titles.find((title, index) => titles.indexOf(title) !== index)
  if (duplicate) throw new Error(`${manifestPath} lists "${duplicate}" more than once`)

  const games = db.collection<GameDocument>('games')
  const bucket = new GridFSBucket(db, { bucketName: GAME_FILE_BUCKET })
  const result: ImportResult = { imported: [], skipped: [] }

  for (const entry of manifest) {
    if (await games.findOne({ title: entry.title }, { projection: { _id: 1 } })) {
      result.skipped.push(entry.title)
      continue
    }
    // Read the file even in a dry run, so a missing file fails before --apply.
    const bytes = await readFile(join(folder, entry.file))
    result.imported.push(entry.title)
    if (!apply) continue

    const fileId = await upload(bucket, entry.file, bytes)
    try {
      await games.insertOne({
        _id: new ObjectId(),
        title: entry.title,
        description: entry.description,
        genre: entry.genre,
        core: entry.core,
        romFileId: fileId,
        createdAt: new Date(),
      })
    } catch (error) {
      // Don't leave a file in GridFS that no game points at.
      await bucket.delete(fileId)
      throw error
    }
  }
  return result
}

function upload(bucket: GridFSBucket, filename: string, bytes: Buffer): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename)
    stream.once('error', reject)
    stream.once('finish', () => resolve(stream.id))
    stream.end(bytes)
  })
}
