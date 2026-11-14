import { type Db, ObjectId } from 'mongodb'
import {
  type Session,
  SessionSchema,
  type SessionStatus,
  type StartSessionRequest,
  type StartSessionResponse,
  StartSessionResponseSchema,
  type UpdateSessionRequest,
} from '@arcade-hub/contracts'
import { HttpError } from '../http/problem.ts'
import { findGame } from './games.ts'
import { findOwnedSave } from './saves.ts'

/** The `sessions` collection (see "MongoDB data model" in docs/spec.md). */
export const SESSIONS_COLLECTION = 'sessions'

export type SessionDocument = {
  _id: ObjectId
  userId: ObjectId
  gameId: ObjectId
  status: SessionStatus
  lastHeartbeatAt: Date
  lastAutosaveId: ObjectId | null
}

function toSession(document: SessionDocument): Session {
  return SessionSchema.parse({
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    gameId: document.gameId.toHexString(),
    status: document.status,
    lastHeartbeatAt: document.lastHeartbeatAt.toISOString(),
    lastAutosaveId: document.lastAutosaveId?.toHexString() ?? null,
  })
}

/**
 * POST /api/sessions. Starts a session for this player, optionally from one of
 * their saves, and answers with everything the player page needs to load the
 * game (the file URL, the core, and the save file to resume from).
 */
export async function startSession(
  db: Db,
  userId: ObjectId,
  request: StartSessionRequest,
): Promise<StartSessionResponse> {
  const game = await findGame(db, request.gameId)
  if (!game) throw new HttpError(404, 'That game does not exist.')

  let saveFileUrl: string | null = null
  if (request.saveId) {
    const save = await findOwnedSave(db, userId, request.saveId)
    if (save.gameId !== game.id) throw new HttpError(400, 'That save belongs to a different game.')
    saveFileUrl = `/api/saves/${save.id}/file`
  }

  const document: SessionDocument = {
    _id: new ObjectId(),
    userId,
    gameId: new ObjectId(game.id),
    status: 'running',
    lastHeartbeatAt: new Date(),
    lastAutosaveId: null,
  }
  await db.collection<SessionDocument>(SESSIONS_COLLECTION).insertOne(document)

  return StartSessionResponseSchema.parse({
    sessionId: document._id.toHexString(),
    gameFileUrl: `/api/games/${game.id}/file`,
    core: game.core,
    saveFileUrl,
  })
}

/** A session this player owns: 404 when unknown, 403 when it is someone else's. */
export async function findOwnedSession(
  db: Db,
  userId: ObjectId,
  id: string,
): Promise<SessionDocument> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'That session does not exist.')
  const document = await db
    .collection<SessionDocument>(SESSIONS_COLLECTION)
    .findOne({ _id: new ObjectId(id) })
  if (!document) throw new HttpError(404, 'That session does not exist.')
  if (!document.userId.equals(userId)) throw new HttpError(403, 'That session is not yours.')
  return document
}

/**
 * POST /api/sessions/{id}/heartbeat: the player page is still on the game.
 * Only core changes a session's status, so this records the heartbeat and
 * leaves the status alone.
 */
export async function heartbeatSession(
  db: Db,
  userId: ObjectId,
  id: string,
): Promise<Session> {
  const session = await findOwnedSession(db, userId, id)
  if (session.status === 'ended') {
    throw new HttpError(409, 'That session has ended. Start a new game to keep playing.')
  }
  if (session.status === 'idle') {
    throw new HttpError(409, 'That session went idle. Start a new game to keep playing.')
  }

  const lastHeartbeatAt = new Date()
  await db
    .collection<SessionDocument>(SESSIONS_COLLECTION)
    .updateOne({ _id: session._id }, { $set: { lastHeartbeatAt } })
  return toSession({ ...session, lastHeartbeatAt })
}

/**
 * DELETE /api/sessions/{id}: the player left the game. Ending a session that
 * has already ended changes nothing, so closing a tab twice is safe.
 */
export async function endSession(db: Db, userId: ObjectId, id: string): Promise<void> {
  const session = await findOwnedSession(db, userId, id)
  if (session.status === 'ended') return
  await db
    .collection<SessionDocument>(SESSIONS_COLLECTION)
    .updateOne({ _id: session._id, status: { $ne: 'ended' } }, { $set: { status: 'ended' } })
}

/** GET /api/sessions/{id}: the session's status, for its owner. */
export async function getSession(db: Db, userId: ObjectId, id: string): Promise<Session> {
  return toSession(await findOwnedSession(db, userId, id))
}

/**
 * PATCH /api/sessions/{id}: pause or resume. Only core changes a status, so the
 * moves allowed here are the ones the player page can ask for: running to
 * paused and back. An idle or ended session is not revived in place; resuming
 * one works like resuming a save, with a new session. Asking for the status a
 * session already has changes nothing.
 */
export async function updateSessionStatus(
  db: Db,
  userId: ObjectId,
  id: string,
  status: UpdateSessionRequest['status'],
): Promise<Session> {
  const session = await findOwnedSession(db, userId, id)
  if (session.status === 'ended') {
    throw new HttpError(409, 'That session has ended. Start a new game to keep playing.')
  }
  if (session.status === 'idle') {
    throw new HttpError(409, 'That session went idle. Start a new game to keep playing.')
  }
  if (session.status === status) return toSession(session)

  await db
    .collection<SessionDocument>(SESSIONS_COLLECTION)
    .updateOne(
      { _id: session._id, status: { $in: ['running', 'paused'] } },
      { $set: { status } },
    )
  return toSession({ ...session, status })
}

/** Remembers the newest autosave, which is what resume and the pruning job read. */
export async function recordAutosave(
  db: Db,
  sessionId: ObjectId,
  saveId: ObjectId,
): Promise<void> {
  await db
    .collection<SessionDocument>(SESSIONS_COLLECTION)
    .updateOne({ _id: sessionId }, { $set: { lastAutosaveId: saveId } })
}
