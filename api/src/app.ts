import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { errorHandler, notFound } from './http/problem.ts'
import { openApiDocument } from './openapi.ts'
import games from './routes/games.ts'
import health from './routes/health.ts'

/** Builds the Express app: routes, Swagger, and the ProblemDetails error handler. */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.use('/api/health', health)
  app.use('/api/games', games)

  app.get('/swagger.json', (_req, res) => {
    res.json(openApiDocument)
  })
  app.use('/swagger', swaggerUi.serve, swaggerUi.setup(openApiDocument))

  app.use(notFound)
  app.use(errorHandler)
  return app
}

/** Tests import the app directly and call it with supertest, without a port. */
export const app = createApp()
