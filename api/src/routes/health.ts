import { Router } from 'express'
import { config } from '../config.ts'
import { connectMongo, isConnected, pingMongo } from '../core/mongo.ts'
import { logger } from '../logger.ts'

const router = Router()

/**
 * GET /api/health. Not part of the public contract: Kubernetes probes read it,
 * the web app never does. It answers 200 either way and reports the database
 * separately, so a missing database shows up as `mongo: "down"`.
 *
 * The probe must never wait for a driver that is still looking for a server: a
 * probe slower than its own timeout restarts a pod that is only missing its
 * database, which is the condition this endpoint exists to report.
 */
router.get('/', async (_req, res) => {
  if (!isConnected()) {
    // Start the attempt anyway, so a later probe can report up without a player
    // request having to arrive first. Failing here is the expected case.
    connectMongo().catch((error: unknown) => {
      logger.debug({ err: error }, 'health: mongo is not reachable')
    })
    res.json({ status: 'ok', mongo: 'down' })
    return
  }
  res.json({ status: 'ok', mongo: await pingMongo(config.mongoHealthTimeoutMs) })
})

export default router
