import type { RequestHandler, Response } from 'express'
import type { Db, ObjectId } from 'mongodb'
import { currentUser } from '../core/auth.ts'
import { database } from '../core/mongo.ts'

/**
 * Resolves the caller before a route reads or parses the request body, so an
 * unauthenticated upload is a 401 and never held in memory, and a request with
 * a bad body is 401 rather than 400.
 *
 * Routes behind this read the results with requestUser and requestDb.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const db = await database()
  res.locals.db = db
  res.locals.userId = await currentUser(db, req.header('authorization'))
  next()
}

/** The player the authenticate middleware resolved. */
export function requestUser(res: Response): ObjectId {
  return res.locals.userId as ObjectId
}

/** The connection authenticate resolved, so a route doesn't ask for it twice. */
export function requestDb(res: Response): Db {
  return res.locals.db as Db
}
