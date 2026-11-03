import { app } from './app.ts'
import { config } from './config.ts'
import { closeMongo, connectMongo } from './core/mongo.ts'
import { logger } from './logger.ts'

// The API keeps serving when MongoDB is down: the catalog answers 503 until it
// comes back, which beats a pod that crashes on boot and has to be restarted.
async function start(): Promise<void> {
  try {
    await connectMongo()
    logger.info({ mongoDb: config.mongoDb }, 'connected to MongoDB')
  } catch (error) {
    logger.warn({ err: error }, 'MongoDB is not reachable yet; the next request retries')
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'api listening')
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      logger.info({ signal }, 'shutting down')
      server.close(() => {
        void closeMongo().then(() => process.exit(0))
      })
    })
  }
}

await start()
