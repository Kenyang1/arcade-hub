import { type Request, type Response, Router } from 'express'
import multer from 'multer'
import type { Db } from 'mongodb'
import { GAME_FILE_FIELD, GameInputSchema, GameQuerySchema } from '@arcade-hub/contracts'
import { config } from '../config.ts'
import {
  createGame,
  deleteGame,
  findGame,
  gameFileProblem,
  listGames,
  openGameFile,
  updateGame,
} from '../core/games.ts'
import { connectMongo } from '../core/mongo.ts'
import { authenticate, requestDb } from '../http/auth.ts'
import { fieldErrors, HttpError } from '../http/problem.ts'
import { logger } from '../logger.ts'

const router = Router()

/** The catalog needs MongoDB, so a missing database is a 503, not a 500. */
async function database(): Promise<Db> {
  try {
    return await connectMongo()
  } catch (error) {
    logger.warn({ err: error }, 'mongo is not reachable')
    throw new HttpError(503, 'The database is not reachable. Please try again in a moment.')
  }
}

/**
 * Adding a game is multipart: the details as fields and the game file as a file
 * part named `file` (see GAME_FILE_FIELD). It is held in memory just long
 * enough to reach GridFS, and capped at config.maxGameFileBytes.
 */
const uploadGameFile = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: config.maxGameFileBytes, fields: 8 },
}).single(GAME_FILE_FIELD)

/**
 * Parses the upload inside the handler rather than as middleware, so the caller
 * is checked, and a stranger is answered, before any bytes are buffered.
 */
function readUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    uploadGameFile(req, res, (error: unknown) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** GET /api/games?search=&genre= */
router.get('/', async (req, res) => {
  const query = GameQuerySchema.safeParse(req.query)
  if (!query.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(query.error.issues))
  }
  res.json(await listGames(await database(), query.data))
})

/**
 * POST /api/games: add a game and its file. Signed in: everyone may add a game,
 * there is no per-game owner (see CLAUDE.md, "Auth").
 */
router.post('/', authenticate, async (req, res) => {
  await readUpload(req, res)

  const body = GameInputSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }
  if (!req.file) {
    throw new HttpError(400, 'Some of what you entered is not valid.', {
      [GAME_FILE_FIELD]: [`The game file field "${GAME_FILE_FIELD}" is required.`],
    })
  }
  if (req.file.size === 0) throw new HttpError(400, 'That game file is empty.')

  const problem = gameFileProblem(req.file.originalname, body.data.core)
  if (problem) throw new HttpError(400, problem, { [GAME_FILE_FIELD]: [problem] })

  const game = await createGame(requestDb(res), {
    ...body.data,
    filename: req.file.originalname,
    bytes: req.file.buffer,
  })
  logger.info({ gameId: game.id, bytes: req.file.size }, 'game added')
  res.status(201).json(game)
})

/**
 * GET /api/games/{id}/file. Public, like the rest of the catalog: game files are
 * what the pages read, so they don't need an account (see CLAUDE.md, "Auth").
 * EmulatorJS plays the bytes as a blob, so the type stays generic.
 */
router.get('/:id/file', async (req, res) => {
  const file = await openGameFile(await database(), req.params.id ?? '')
  if (!file) throw new HttpError(404, 'That game file does not exist.')

  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Length', file.length)
  file.stream.on('error', (error) => {
    logger.error({ err: error, gameId: req.params.id }, 'game file stream failed')
    res.destroy(error)
  })
  res.on('close', () => {
    file.stream.destroy()
  })
  file.stream.pipe(res)
})

/** PUT /api/games/{id}: edit the details. The game file stays. Signed in. */
router.put('/:id', authenticate, async (req, res) => {
  const body = GameInputSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const game = await updateGame(requestDb(res), String(req.params.id ?? ''), body.data)
  logger.info({ gameId: game.id }, 'game edited')
  res.json(game)
})

/** DELETE /api/games/{id}: remove the game and its file. Signed in. */
router.delete('/:id', authenticate, async (req, res) => {
  const gameId = String(req.params.id ?? '')
  await deleteGame(requestDb(res), gameId)
  logger.info({ gameId }, 'game deleted')
  res.status(204).end()
})

/** GET /api/games/{id} */
router.get('/:id', async (req, res) => {
  const game = await findGame(await database(), req.params.id ?? '')
  if (!game) throw new HttpError(404, 'That game does not exist.')
  res.json(game)
})

export default router
