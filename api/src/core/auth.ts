import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { AuthResponse, User } from '@arcade-hub/contracts'
import jwt from 'jsonwebtoken'
import { type Db, ObjectId } from 'mongodb'
import { z } from 'zod'
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
 * Sign-in is M3, so a server with ALLOW_STAND_IN_USER set plays a request with
 * no token as one stand-in account instead of rejecting it; that is how the
 * Nov 15 save-state check runs on the cluster before accounts exist. The flag is
 * off by default, so a deployment that forgets it answers 401, not someone
 * else's saves.
 */
export async function currentUser(db: Db, authorization: string | undefined): Promise<ObjectId> {
  if (authorization) {
    const [scheme, token] = authorization.split(' ')
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Please sign in first.')
    const id = userIdFromToken(token)
    if (!ObjectId.isValid(id)) throw new HttpError(401, 'Please sign in first.')
    return new ObjectId(id)
  }
  if (!config.allowStandInUser) throw new HttpError(401, 'Please sign in first.')
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

/**
 * The stand-in account requests without a token share until M3. Its password is
 * random and discarded: nothing signs in as it, and by the time sign-in exists
 * this account is gone with ALLOW_STAND_IN_USER.
 */
function standInUser(db: Db): Promise<ObjectId> {
  return findOrCreateUser(db, DEV_USERNAME, randomBytes(32).toString('hex'))
}

/**
 * SEED_DEV_USERS: create the development accounts on startup. Ignored outside
 * development, and safe to run on every boot.
 */
export async function seedDevUsers(db: Db): Promise<void> {
  if (!config.seedDevUsers || config.nodeEnv !== 'development') return
  if (!config.seedDevPassword) {
    logger.warn('SEED_DEV_USERS is set but SEED_DEV_PASSWORD is empty: not seeding development users')
    return
  }
  await findOrCreateUser(db, DEV_USERNAME, config.seedDevPassword)
  await findOrCreateUser(db, 'dev-player2', config.seedDevPassword)
  logger.info({ users: 2 }, 'seeded development users')
}

/**
 * What a new account may use. The contract only says "two strings", so the API
 * checks these itself and answers 400 with field errors (docs/plans/2026-11-19-auth-routes.md).
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/
export const PASSWORD_MIN_LENGTH = 8
/** scrypt on a megabyte of password is slow on purpose; nobody needs more than this. */
export const PASSWORD_MAX_LENGTH = 128

export const NewAccountSchema = z.object({
  username: z
    .string({ error: 'Enter a username.' })
    .trim()
    .regex(USERNAME_PATTERN, 'Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.'),
  password: z
    .string({ error: 'Enter a password.' })
    .min(PASSWORD_MIN_LENGTH, `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Passwords can be at most ${PASSWORD_MAX_LENGTH} characters.`),
})
export type NewAccount = z.infer<typeof NewAccountSchema>

/**
 * Usernames nobody can register. With ALLOW_STAND_IN_USER on, every request
 * without a token plays as DEV_USERNAME, so a real person must never own it.
 */
const RESERVED_USERNAMES = new Set([DEV_USERNAME])

const USERNAME_TAKEN = 'That username is taken. Pick another one.'
const WRONG_CREDENTIALS = "That username and password don't match."

/** The public view of an account: never its password hash. */
export function toUser(document: UserDocument): User {
  return {
    id: document._id.toHexString(),
    username: document.username,
    createdAt: document.createdAt.toISOString(),
  }
}

/** A token can't be signed without the key, which is the deployment's problem, not the player's. */
function assertCanSignIn(): void {
  if (!config.jwtSigningKey) throw new HttpError(503, "Accounts aren't switched on on the server yet.")
}

function authResponse(document: UserDocument): AuthResponse {
  return { token: signToken(document._id.toHexString()), user: toUser(document) }
}

/**
 * POST /api/auth/register: creates the account and signs in as it. A taken or
 * reserved username is a 409; the unique index on users.username settles two
 * people registering the same name at once.
 */
export async function registerUser(db: Db, account: NewAccount): Promise<AuthResponse> {
  assertCanSignIn()
  if (RESERVED_USERNAMES.has(account.username)) throw new HttpError(409, USERNAME_TAKEN)

  const users = db.collection<UserDocument>(USERS_COLLECTION)
  const document: UserDocument = {
    _id: new ObjectId(),
    username: account.username,
    passwordHash: await hashPassword(account.password),
    createdAt: new Date(),
  }
  try {
    await users.insertOne(document)
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, USERNAME_TAKEN)
    throw error
  }
  return authResponse(document)
}

/** Hashed once, so a sign-in for an unknown username costs the same scrypt as a real one. */
let decoyHash: Promise<string> | undefined

/**
 * POST /api/auth/login. An unknown username and a wrong password get the same
 * 401 in about the same time, so the answer doesn't tell anyone which
 * usernames exist.
 */
export async function signIn(db: Db, username: string, password: string): Promise<AuthResponse> {
  assertCanSignIn()
  const name = username.trim()
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(401, WRONG_CREDENTIALS)
  }

  const user = await db.collection<UserDocument>(USERS_COLLECTION).findOne({ username: name })
  if (!user) {
    decoyHash ??= hashPassword(randomBytes(32).toString('hex'))
    await verifyPassword(password, await decoyHash)
    throw new HttpError(401, WRONG_CREDENTIALS)
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, WRONG_CREDENTIALS)
  return authResponse(user)
}
