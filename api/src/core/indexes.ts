import { type Db, type ObjectId } from 'mongodb'
import { logger } from '../logger.ts'
import { USERS_COLLECTION, type UserDocument } from './auth.ts'
import { SAVES_COLLECTION } from './saves.ts'
import { SESSIONS_COLLECTION } from './sessions.ts'

// The indexes the API depends on, built once per connection before any request
// sees the database (see core/mongo.ts).

/** MongoDB's code for a duplicate key, the only error `ensureIndexes` repairs. */
function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number }).code === 11000
}

/**
 * `users.username` is unique, so two requests that both find no account can't
 * both create one. Without it an empty database could end up with several
 * `dev-player` rows, and each request would pick one at random: a session
 * started by one copy answers 403 when the next request resolves the other.
 *
 * A database that grew duplicates before the index existed can't build it, so
 * those are merged first and the build retried.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const users = db.collection<UserDocument>(USERS_COLLECTION)
  try {
    await users.createIndex({ username: 1 }, { unique: true })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    const merged = await mergeDuplicateUsers(db)
    logger.warn(merged, 'users: merged duplicate usernames so the unique index can be built')
    await users.createIndex({ username: 1 }, { unique: true })
  }
}

type DuplicateUsername = {
  /** The username that appears more than once. */
  _id: string
  /** Every account with that username, oldest first. */
  ids: ObjectId[]
}

/**
 * Keeps the oldest account per username and hands the sessions and saves of the
 * newer copies over to it, so a player's history stays theirs. Only reachable on
 * a database that predates the unique index.
 */
async function mergeDuplicateUsers(db: Db): Promise<{ usernames: number; removed: number }> {
  const users = db.collection<UserDocument>(USERS_COLLECTION)
  // $push keeps the order it receives, so $sort makes ids[0] the oldest account.
  const duplicates = await users
    .aggregate<DuplicateUsername>([
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: '$username', ids: { $push: '$_id' } } },
      { $match: { 'ids.1': { $exists: true } } },
    ])
    .toArray()

  let removed = 0
  for (const { ids } of duplicates) {
    const [kept, ...extras] = ids
    if (!kept || extras.length === 0) continue
    await db
      .collection(SESSIONS_COLLECTION)
      .updateMany({ userId: { $in: extras } }, { $set: { userId: kept } })
    await db
      .collection(SAVES_COLLECTION)
      .updateMany({ userId: { $in: extras } }, { $set: { userId: kept } })
    const { deletedCount } = await users.deleteMany({ _id: { $in: extras } })
    removed += deletedCount
  }
  return { usernames: duplicates.length, removed }
}
