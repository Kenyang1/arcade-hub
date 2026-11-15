import { z } from 'zod'
import {
  GameSchema,
  ProblemDetailsSchema,
  SaveSchema,
  SessionSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  UpdateSessionRequestSchema,
} from '@arcade-hub/contracts'

// The document Swagger UI serves at /swagger, built from the contract schemas so
// the docs can't drift from what the API validates. The endpoints that land add
// their paths here.
const game = z.toJSONSchema(GameSchema)
const session = z.toJSONSchema(SessionSchema)
const save = z.toJSONSchema(SaveSchema)
const startSessionRequest = z.toJSONSchema(StartSessionRequestSchema)
const startSessionResponse = z.toJSONSchema(StartSessionResponseSchema)
const updateSessionRequest = z.toJSONSchema(UpdateSessionRequestSchema)
const problemDetails = z.toJSONSchema(ProblemDetailsSchema)

const problemResponse = {
  description: 'ProblemDetails (RFC 9457).',
  content: { 'application/problem+json': { schema: problemDetails } },
}

/** Saves and sessions belong to one player, so these paths need a bearer token. */
const signedIn = [{ bearerAuth: [] }]

const idParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Arcade Hub API',
    version: '0.2.0',
    description:
      'The catalog, play sessions and save states today; accounts and pause/resume follow (see docs/spec.md).',
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
        parameters: [idParameter],
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
        parameters: [idParameter],
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
    '/api/sessions': {
      post: {
        summary: 'Start a game session',
        description:
          'Starts a running session for the signed-in player. With `saveId`, the response points at that save so the player page can resume it.',
        security: signedIn,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: startSessionRequest } },
        },
        responses: {
          201: {
            description: 'The session and what the player page needs to load the game.',
            content: { 'application/json': { schema: startSessionResponse } },
          },
          400: problemResponse,
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/sessions/{id}/heartbeat': {
      post: {
        summary: 'Report that the player is still playing',
        description:
          'The player page calls this every 30 s. `idle-sweep` marks a session idle after 10 minutes without a heartbeat. An idle or ended session answers 409.',
        security: signedIn,
        parameters: [idParameter],
        responses: {
          204: { description: 'Heartbeat recorded.' },
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          409: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/sessions/{id}': {
      get: {
        summary: "One session's status",
        security: signedIn,
        parameters: [idParameter],
        responses: {
          200: {
            description: 'The session.',
            content: { 'application/json': { schema: session } },
          },
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          503: problemResponse,
        },
      },
      patch: {
        summary: 'Pause or resume a session',
        description:
          'Moves a running session to paused, or a paused session back to running. An idle or ended session is not revived in place: resuming one works like resuming a save, with a new session. Asking for the status a session already has changes nothing.',
        security: signedIn,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: updateSessionRequest } },
        },
        responses: {
          200: {
            description: 'The session with its new status.',
            content: { 'application/json': { schema: session } },
          },
          400: problemResponse,
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          409: problemResponse,
          503: problemResponse,
        },
      },
      delete: {
        summary: 'End a session',
        description: 'Safe to call twice: an already ended session answers 204 again.',
        security: signedIn,
        parameters: [idParameter],
        responses: {
          204: { description: 'The session is ended.' },
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/sessions/{id}/saves': {
      post: {
        summary: 'Upload a save state',
        description:
          'Multipart form data: a `kind` field (`manual` or `autosave`) and the state as a file part named `state`. The state goes into GridFS; the response is the save, not the file.',
        security: signedIn,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['manual', 'autosave'] },
                  state: { type: 'string', format: 'binary' },
                },
                required: ['kind', 'state'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'The stored save.',
            content: { 'application/json': { schema: save } },
          },
          400: problemResponse,
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          409: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/saves': {
      get: {
        summary: "The signed-in player's saves",
        description: 'Newest first. `gameId` narrows the list to one game.',
        security: signedIn,
        parameters: [
          { name: 'gameId', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'The saves that belong to this player.',
            content: { 'application/json': { schema: { type: 'array', items: save } } },
          },
          400: problemResponse,
          401: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/saves/{id}/file': {
      get: {
        summary: 'Download a save state',
        description: 'Streams the state from GridFS. Only the player who owns the save may read it.',
        security: signedIn,
        parameters: [idParameter],
        responses: {
          200: {
            description: 'The save state.',
            content: {
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
            },
          },
          401: problemResponse,
          403: problemResponse,
          404: problemResponse,
          503: problemResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Game: game,
      Session: session,
      Save: save,
      StartSessionRequest: startSessionRequest,
      StartSessionResponse: startSessionResponse,
      ProblemDetails: problemDetails,
    },
  },
}
