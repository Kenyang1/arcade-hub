import { type Request, type Response, Router } from 'express'
import multer from 'multer'
import { type Db, ObjectId } from 'mongodb'
import {
  type Save,
  SAVE_FRAME_FIELD,
  SAVE_STATE_FIELD,
  SaveUploadFieldsSchema,
  StartSessionRequestSchema,
  UpdateSessionRequestSchema,
} from '@arcade-hub/contracts'
import { config } from '../config.ts'
import { type VisionModel, defaultVisionModel } from '../core/ai.ts'
import { findGame } from '../core/games.ts'
import { type NewSave, createSave, labelSave } from '../core/saves.ts'
import {
  assertAcceptsSaves,
  endSession,
  findOwnedSession,
  getSession,
  heartbeatSession,
  recordAutosave,
  startSession,
  updateSessionStatus,
} from '../core/sessions.ts'
import { authenticate, requestDb, requestUser } from '../http/auth.ts'
import { HttpError, fieldErrors } from '../http/problem.ts'
import { logger } from '../logger.ts'

const router = Router()

/**
 * The save upload is multipart: the `kind` field plus the state as a file part
 * named `state`, and optionally the game screen as a PNG part named `frame`
 * (see SaveUploadFieldsSchema). Both are held in memory just long enough to
 * reach GridFS or the AI, and each is capped at config.maxSaveStateBytes.
 */
const uploadState = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: config.maxSaveStateBytes, fields: 8 },
}).fields([
  { name: SAVE_STATE_FIELD, maxCount: 1 },
  { name: SAVE_FRAME_FIELD, maxCount: 1 },
])

/** The uploaded file part with this name, if the request had one. */
function uploadedFile(req: Request, name: string): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[] | undefined> | undefined
  return files?.[name]?.[0]
}

/**
 * Parses the upload inside the handler rather than as middleware, so the caller
 * and the session are checked before any bytes are buffered.
 */
function readUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    uploadState(req, res, (error: unknown) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** POST /api/sessions: start a game, optionally resuming one of this player's saves. */
router.post('/', authenticate, async (req, res) => {
  const body = StartSessionRequestSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const userId = requestUser(res)
  const started = await startSession(requestDb(res), userId, body.data)
  logger.info({ sessionId: started.sessionId, gameId: body.data.gameId, userId: userId.toHexString() }, 'session started')
  res.status(201).json(started)
})

/** GET /api/sessions/{id}: the session's status. */
router.get('/:id', authenticate, async (req, res) => {
  const db = requestDb(res)
  res.json(await getSession(db, requestUser(res), String(req.params.id ?? '')))
})

/** PATCH /api/sessions/{id}: pause or resume. Only core changes the status. */
router.patch('/:id', authenticate, async (req, res) => {
  const body = UpdateSessionRequestSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const userId = requestUser(res)
  const session = await updateSessionStatus(
    requestDb(res),
    userId,
    String(req.params.id ?? ''),
    body.data.status,
  )
  logger.info({ sessionId: session.id, userId: userId.toHexString(), status: session.status }, 'session status changed')
  res.json(session)
})

/** POST /api/sessions/{id}/saves: upload a save state, manual or autosave. */
router.post('/:id/saves', authenticate, async (req, res) => {
  const db = requestDb(res)
  const userId = requestUser(res)
  // The caller and the session come first: a stranger or a dead session is
  // answered without reading a byte of the upload.
  const session = await findOwnedSession(db, userId, String(req.params.id ?? ''))
  assertAcceptsSaves(session)
  await readUpload(req, res)

  const fields = SaveUploadFieldsSchema.safeParse({ kind: (req.body as { kind?: unknown }).kind })
  if (!fields.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(fields.error.issues))
  }
  const state = uploadedFile(req, SAVE_STATE_FIELD)
  if (!state) {
    throw new HttpError(400, 'Some of what you entered is not valid.', {
      [SAVE_STATE_FIELD]: [`The save state file field "${SAVE_STATE_FIELD}" is required.`],
    })
  }
  if (state.size === 0) throw new HttpError(400, 'The save state is empty.')

  const input: NewSave = {
    userId,
    gameId: session.gameId,
    kind: fields.data.kind,
    bytes: state.buffer,
  }
  const save = await createSave(db, input)
  if (save.kind === 'autosave') await recordAutosave(db, session._id, new ObjectId(save.id))

  logger.info(
    { sessionId: session._id.toHexString(), saveId: save.id, gameId: save.gameId, userId: userId.toHexString() },
    `save uploaded (${save.kind})`,
  )
  res.status(201).json(save)

  // The label comes after the answer, so a slow or failing AI never holds up
  // or fails the save. labelSave already turns AI failures into null; this
  // catch is for the database calls around it.
  const frame = uploadedFile(req, SAVE_FRAME_FIELD)
  const model = defaultVisionModel()
  if (frame && frame.size > 0 && model) {
    const logFields = { sessionId: session._id.toHexString(), saveId: save.id, gameId: save.gameId }
    labelUploadedSave(db, save, frame.buffer, model).catch((error: unknown) => {
      logger.error({ ...logFields, err: error }, 'labelling a save failed')
    })
  }
})

async function labelUploadedSave(db: Db, save: Save, png: Buffer, model: VisionModel): Promise<void> {
  const game = await findGame(db, save.gameId)
  if (!game) return
  await labelSave(db, new ObjectId(save.id), png, { id: game.id, title: game.title }, model)
}

/** POST /api/sessions/{id}/heartbeat: still playing. The player page sends this every 30 s. */
router.post('/:id/heartbeat', authenticate, async (req, res) => {
  await heartbeatSession(requestDb(res), requestUser(res), String(req.params.id ?? ''))
  res.status(204).end()
})

/** DELETE /api/sessions/{id}: end the session. Safe to call twice. */
router.delete('/:id', authenticate, async (req, res) => {
  const userId = requestUser(res)
  const sessionId = String(req.params.id ?? '')
  await endSession(requestDb(res), userId, sessionId)
  logger.info({ sessionId, userId: userId.toHexString() }, 'session ended')
  res.status(204).end()
})

export default router
