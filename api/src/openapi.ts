import { z } from 'zod'
import { GameSchema, ProblemDetailsSchema } from '@arcade-hub/contracts'

// The document Swagger UI serves at /swagger, built from the contract schemas so
// the docs can't drift from what the API validates. The endpoints that land add
// their paths here.
const game = z.toJSONSchema(GameSchema)
const problemDetails = z.toJSONSchema(ProblemDetailsSchema)

const problemResponse = {
  description: 'ProblemDetails (RFC 9457).',
  content: { 'application/problem+json': { schema: problemDetails } },
}

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Arcade Hub API',
    version: '0.1.0',
    description: 'The catalog today; sessions, saves and accounts follow (see docs/spec.md).',
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Liveness and database status',
        responses: {
          200: {
            description: 'The API is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', examples: ['ok'] },
                    mongo: { type: 'string', enum: ['up', 'down'] },
                  },
                  required: ['status', 'mongo'],
                },
              },
            },
          },
        },
      },
    },
    '/api/games': {
      get: {
        summary: 'List or search the catalog',
        parameters: [
          {
            name: 'search',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Part of a title, case-insensitive.',
          },
          { name: 'genre', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Every matching game, sorted by title.',
            content: { 'application/json': { schema: { type: 'array', items: game } } },
          },
          400: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/games/{id}': {
      get: {
        summary: "One game's details",
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'The game.', content: { 'application/json': { schema: game } } },
          404: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/games/{id}/file': {
      get: {
        summary: 'Download the game file EmulatorJS plays',
        description:
          'Streams the game file from GridFS. Public, like the rest of the catalog.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'The game file.',
            content: {
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
            },
          },
          404: problemResponse,
          503: problemResponse,
        },
      },
    },
  },
  components: {
    schemas: { Game: game, ProblemDetails: problemDetails },
  },
}
