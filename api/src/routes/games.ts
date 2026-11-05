import { Router } from 'express'
import type { Db } from 'mongodb'
import { GameQuerySchema } from '@arcade-hub/contracts'
import { findGame, listGames, openGameFile } from '../core/games.ts'
import { connectMongo } from '../core/mongo.ts'
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

/** GET /api/games?search=&genre= */
router.get('/', async (req, res) => {
  const query = GameQuerySchema.safeParse(req.query)
  if (!query.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(query.error.issues))
  }
  res.json(await listGames(await database(), query.data))
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

/** GET /api/games/{id} */
router.get('/:id', async (req, res) => {
  const game = await findGame(await database(), req.params.id ?? '')
  if (!game) throw new HttpError(404, 'That game does not exist.')
  res.json(game)
})

export default router
