import { z } from 'zod'
import {
  AuthResponseSchema,
  CredentialsSchema,
  GameSchema,
  GameInputSchema,
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
const credentials = z.toJSONSchema(CredentialsSchema)
const authResponse = z.toJSONSchema(AuthResponseSchema)
const gameInput = z.toJSONSchema(GameInputSchema)

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
    version: '0.3.0',
    description:
      'The catalog and the games in it, accounts, play sessions and save states today; pause/resume follows (see docs/spec.md).',
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
    '/api/auth/register': {
      post: {
        summary: 'Create an account and sign in',
        description:
          'Username: 3 to 32 letters, numbers, dots, dashes or underscores (trimmed). Password: 8 to 128 characters. A taken username answers 409. The response carries a bearer token for every signed-in path.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: credentials } },
        },
        responses: {
          201: {
            description: 'The new account and its bearer token.',
            content: { 'application/json': { schema: authResponse } },
          },
          400: problemResponse,
          409: problemResponse,
          503: problemResponse,
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Sign in',
        description:
          'An unknown username and a wrong password both answer 401 with the same message. Tokens last 7 days.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: credentials } },
        },
        responses: {
          200: {
            description: 'The account and a bearer token.',
            content: { 'application/json': { schema: authResponse } },
          },
          400: problemResponse,
          401: problemResponse,
          503: problemResponse,
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
      post: {
        summary: 'Add a game with its file',
        description:
          'Multipart form data: `title`, `description`, `genre`, `core`, and the game file as a file part named `file`. The file goes into GridFS and the game into the catalog. A title that already exists answers 409. Signed in.',
        security: signedIn,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  genre: { type: 'string' },
                  core: { type: 'string', enum: ['nes', 'snes', 'gb', 'gba'] },
                  file: { type: 'string', format: 'binary' },
                },
                required: ['title', 'description', 'genre', 'core', 'file'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'The added game.',
            content: { 'application/json': { schema: game } },
          },
          400: problemResponse,
          401: problemResponse,
          409: problemResponse,
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
      put: {
        summary: 'Edit a game',
        description: 'Changes the details only; the game file stays. A title another game already has answers 409. Signed in.',
        security: signedIn,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: gameInput } },
        },
        responses: {
          200: {
            description: 'The edited game.',
            content: { 'application/json': { schema: game } },
          },
          400: problemResponse,
          401: problemResponse,
          404: problemResponse,
          409: problemResponse,
          503: problemResponse,
        },
      },
      delete: {
        summary: 'Remove a game',
        description: 'Removes the game and its file. Signed in.',
        security: signedIn,
        parameters: [idParameter],
        responses: {
          204: { description: 'The game is gone.' },
          401: problemResponse,
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
          'Multipart form data: a `kind` field (`manual` or `autosave`), the state as a file part named `state`, and optionally the game screen as a PNG file part named `frame`. The state goes into GridFS; the response is the save, not the file. When a frame is sent and the AI is on, the save gets a `label` shortly after this response, read from the frame; it is never in the response itself.',
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
                  frame: { type: 'string', format: 'binary', description: 'The game screen as a PNG, for the AI label.' },
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
      GameInput: gameInput,
      Session: session,
      Save: save,
      StartSessionRequest: startSessionRequest,
      StartSessionResponse: startSessionResponse,
      ProblemDetails: problemDetails,
    },
  },
}
