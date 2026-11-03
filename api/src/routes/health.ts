import { Router } from 'express'
import { connectMongo, pingMongo } from '../core/mongo.ts'
import { logger } from '../logger.ts'

const router = Router()

/**
 * GET /api/health. Not part of the public contract: Kubernetes probes read it,
 * the web app never does. It answers 200 either way and reports the database
 * separately, so a missing database shows up as `mongo: "down"`.
 */
router.get('/', async (_req, res) => {
  try {
    await connectMongo()
  } catch (error) {
    logger.debug({ err: error }, 'health: mongo is not reachable')
  }
  res.json({ status: 'ok', mongo: await pingMongo() })
})

export default router
