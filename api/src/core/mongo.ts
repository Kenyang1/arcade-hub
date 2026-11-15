import { type Db, MongoClient } from 'mongodb'
import { config } from '../config.ts'
import { HttpError } from '../http/problem.ts'
import { logger } from '../logger.ts'
import { ensureIndexes } from './indexes.ts'

let client: MongoClient | undefined
let db: Db | undefined
let connecting: Promise<Db> | undefined

/**
 * Connects to MongoDB once and reuses the connection. A failed attempt is not
 * cached, so the next request tries again instead of failing until a restart.
 */
export function connectMongo(
  url: string = config.mongoUrl,
  dbName: string = config.mongoDb,
): Promise<Db> {
  if (db) return Promise.resolve(db)
  connecting ??= (async () => {
    const nextClient = new MongoClient(url, { serverSelectionTimeoutMS: config.mongoTimeoutMs })
    await nextClient.connect()
    const nextDb = nextClient.db(dbName)
    await nextDb.command({ ping: 1 })
    // Before any request sees the database, so nothing races the unique index
    // on users.username (see core/indexes.ts).
    await ensureIndexes(nextDb)
    client = nextClient
    db = nextDb
    return nextDb
  })().finally(() => {
    connecting = undefined
  })
  return connecting
}

/**
 * The database a route needs, or a 503 when MongoDB is not reachable: a missing
 * database is a temporary condition, not a bug in the request.
 */
export async function database(): Promise<Db> {
  try {
    return await connectMongo()
  } catch (error) {
    logger.warn({ err: error }, 'mongo is not reachable')
    throw new HttpError(503, 'The database is not reachable. Please try again in a moment.')
  }
}

/** True once a connection has been made. */
export function isConnected(): boolean {
  return db !== undefined
}

/** `up` when MongoDB answers a ping, `down` otherwise. Never throws. */
export async function pingMongo(): Promise<'up' | 'down'> {
  if (!db) return 'down'
  try {
    await db.command({ ping: 1 })
    return 'up'
  } catch (error) {
    logger.warn({ err: error }, 'mongo ping failed')
    return 'down'
  }
}

/** Closes the connection. Tests call this once they are done. */
export async function closeMongo(): Promise<void> {
  await client?.close()
  client = undefined
  db = undefined
}
