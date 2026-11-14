import { Router } from 'express'
import multer from 'multer'
import { ObjectId } from 'mongodb'
import {
  SAVE_STATE_FIELD,
  SaveUploadFieldsSchema,
  StartSessionRequestSchema,
  UpdateSessionRequestSchema,
} from '@arcade-hub/contracts'
import { config } from '../config.ts'
import { currentUser } from '../core/auth.ts'
import { database } from '../core/mongo.ts'
import { createSave, type NewSave } from '../core/saves.ts'
import {
  endSession,
  findOwnedSession,
  getSession,
  heartbeatSession,
  recordAutosave,
  startSession,
  updateSessionStatus,
} from '../core/sessions.ts'
import { fieldErrors, HttpError } from '../http/problem.ts'
import { logger } from '../logger.ts'

const router = Router()

/**
 * The save upload is multipart: the `kind` field plus the state as a file part
 * named `state` (see SaveUploadFieldsSchema). It is held in memory just long
 * enough to reach GridFS, and capped at config.maxSaveStateBytes.
 */
const uploadState = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: config.maxSaveStateBytes, fields: 8 },
}).single(SAVE_STATE_FIELD)

/** POST /api/sessions: start a game, optionally resuming one of this player's saves. */
router.post('/', async (req, res) => {
  const body = StartSessionRequestSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  const started = await startSession(db, userId, body.data)
  logger.info({ sessionId: started.sessionId, gameId: body.data.gameId, userId: userId.toHexString() }, 'session started')
  res.status(201).json(started)
})

/** GET /api/sessions/{id}: the session's status. */
router.get('/:id', async (req, res) => {
  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  res.json(await getSession(db, userId, String(req.params.id ?? '')))
})

/** PATCH /api/sessions/{id}: pause or resume. Only core changes the status. */
router.patch('/:id', async (req, res) => {
  const body = UpdateSessionRequestSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  const session = await updateSessionStatus(
    db,
    userId,
    String(req.params.id ?? ''),
    body.data.status,
  )
  logger.info({ sessionId: session.id, userId: userId.toHexString(), status: session.status }, 'session status changed')
  res.json(session)
})

/** POST /api/sessions/{id}/saves: upload a save state, manual or autosave. */
router.post('/:id/saves', uploadState, async (req, res) => {
  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  const session = await findOwnedSession(db, userId, String(req.params.id ?? ''))

  const fields = SaveUploadFieldsSchema.safeParse({ kind: (req.body as { kind?: unknown }).kind })
  if (!fields.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(fields.error.issues))
  }
  if (!req.file) {
    throw new HttpError(400, 'Some of what you entered is not valid.', {
      [SAVE_STATE_FIELD]: [`The save state file field "${SAVE_STATE_FIELD}" is required.`],
    })
  }
  if (req.file.size === 0) throw new HttpError(400, 'The save state is empty.')
  if (session.status === 'ended') {
    throw new HttpError(409, 'That session has ended, so it cannot take saves. Start a new game.')
  }

  const input: NewSave = {
    userId,
    gameId: session.gameId,
    kind: fields.data.kind,
    bytes: req.file.buffer,
  }
  const save = await createSave(db, input)
  if (save.kind === 'autosave') await recordAutosave(db, session._id, new ObjectId(save.id))

  logger.info(
    { sessionId: session._id.toHexString(), saveId: save.id, gameId: save.gameId, userId: userId.toHexString() },
    `save uploaded (${save.kind})`,
  )
  res.status(201).json(save)
})

/** POST /api/sessions/{id}/heartbeat: still playing. The player page sends this every 30 s. */
router.post('/:id/heartbeat', async (req, res) => {
  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  await heartbeatSession(db, userId, String(req.params.id ?? ''))
  res.status(204).end()
})

/** DELETE /api/sessions/{id}: end the session. Safe to call twice. */
router.delete('/:id', async (req, res) => {
  const db = await database()
  const userId = await currentUser(db, req.header('authorization'))
  const sessionId = String(req.params.id ?? '')
  await endSession(db, userId, sessionId)
  logger.info({ sessionId, userId: userId.toHexString() }, 'session ended')
  res.status(204).end()
})

export default router
