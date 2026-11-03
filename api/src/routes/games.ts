import { Router } from 'express'
import type { Db } from 'mongodb'
import { GameQuerySchema } from '@arcade-hub/contracts'
import { findGame, listGames } from '../core/games.ts'
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

/** GET /api/games/{id} */
router.get('/:id', async (req, res) => {
  const game = await findGame(await database(), req.params.id ?? '')
  if (!game) throw new HttpError(404, 'That game does not exist.')
  res.json(game)
})

export default router
