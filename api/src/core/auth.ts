import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'
import { type Db, ObjectId } from 'mongodb'
import { config } from '../config.ts'
import { HttpError } from '../http/problem.ts'
import { logger } from '../logger.ts'

const scryptAsync = promisify(scrypt)
const SALT_BYTES = 16
const KEY_BYTES = 64
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7

/** The `users` collection (see "MongoDB data model" in docs/spec.md). */
export const USERS_COLLECTION = 'users'

/** The account development and tests play as until sign-in lands in M3. */
export const DEV_USERNAME = 'dev-player'

export type UserDocument = {
  _id: ObjectId
  username: string
  passwordHash: string
  createdAt: Date
}

/** `<salt-hex>:<hash-hex>`, with a fresh random salt for every user. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

/** True when `password` is the one behind `stored`. Never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const key = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** A bearer token for this user, signed with JWT_SIGNING_KEY. */
export function signToken(userId: string): string {
  if (!config.jwtSigningKey) throw new Error('JWT_SIGNING_KEY is not set')
  return jwt.sign({}, config.jwtSigningKey, {
    subject: userId,
    issuer: config.jwtIssuer,
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME_SECONDS,
  })
}

/** The user id in a bearer token. An expired, foreign or malformed token is a 401. */
export function userIdFromToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.jwtSigningKey, {
      issuer: config.jwtIssuer,
      algorithms: ['HS256'],
    })
    if (typeof payload === 'string' || !payload.sub) throw new Error('token has no subject')
    return payload.sub
  } catch {
    throw new HttpError(401, 'Please sign in first.')
  }
}

/**
 * The player behind a request: the subject of its bearer token.
 *
 * Sign-in is M3, so a server outside production with no token plays as one
 * stand-in account instead of rejecting every request; that is how the Nov 15
 * save-state check runs before accounts exist. Production always answers 401.
 */
export async function currentUser(db: Db, authorization: string | undefined): Promise<ObjectId> {
  if (authorization) {
    const [scheme, token] = authorization.split(' ')
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Please sign in first.')
    const id = userIdFromToken(token)
    if (!ObjectId.isValid(id)) throw new HttpError(401, 'Please sign in first.')
    return new ObjectId(id)
  }
  if (config.nodeEnv === 'production') throw new HttpError(401, 'Please sign in first.')
  return standInUser(db)
}

/** Find-or-create an account, so a repeated call never duplicates a username. */
async function findOrCreateUser(db: Db, username: string, password: string): Promise<ObjectId> {
  const users = db.collection<UserDocument>(USERS_COLLECTION)
  const existing = await users.findOne({ username }, { projection: { _id: 1 } })
  if (existing) return existing._id

  const document: UserDocument = {
    _id: new ObjectId(),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  }
  try {
    await users.insertOne(document)
    return document._id
  } catch (error) {
    // A concurrent request created it first; that row is the one to use.
    if ((error as { code?: number }).code === 11000) {
      const raced = await users.findOne({ username }, { projection: { _id: 1 } })
      if (raced) return raced._id
    }
    throw error
  }
}

/** The stand-in account non-production requests share until M3. */
function standInUser(db: Db): Promise<ObjectId> {
  return findOrCreateUser(db, DEV_USERNAME, config.seedDevPassword)
}

/**
 * SEED_DEV_USERS: create the development accounts on startup. Ignored outside
 * development, and safe to run on every boot.
 */
export async function seedDevUsers(db: Db): Promise<void> {
  if (!config.seedDevUsers || config.nodeEnv !== 'development') return
  await findOrCreateUser(db, DEV_USERNAME, config.seedDevPassword)
  await findOrCreateUser(db, 'dev-player2', config.seedDevPassword)
  logger.info({ users: 2 }, 'seeded development users')
}
