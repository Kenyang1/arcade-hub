import type { ErrorRequestHandler, RequestHandler, Response } from 'express'
import type { ProblemDetails } from '@arcade-hub/contracts'
import { logger } from '../logger.ts'

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Not signed in',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  500: 'Server error',
  503: 'Service unavailable',
}

/** An error a route raises on purpose. The error handler writes it as ProblemDetails. */
export class HttpError extends Error {
  readonly status: number
  readonly errors: Record<string, string[]> | undefined

  constructor(status: number, detail: string, errors?: Record<string, string[]>) {
    super(detail)
    this.name = 'HttpError'
    this.status = status
    this.errors = errors
  }
}

/** Writes a ProblemDetails body (RFC 9457) with its own content type. */
export function problem(
  res: Response,
  status: number,
  detail: string,
  errors?: Record<string, string[]>,
): void {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: TITLES[status] ?? 'Error',
    status,
    detail,
    instance: res.req.originalUrl,
  }
  if (errors) body.errors = errors
  res.status(status).type('application/problem+json').json(body)
}

/** Validation messages keyed by field, for the `errors` member of a 400. */
export function fieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '_'
    const messages = errors[field] ?? []
    messages.push(issue.message)
    errors[field] = messages
  }
  return errors
}

export const notFound: RequestHandler = (_req, res) => {
  problem(res, 404, 'That page does not exist.')
}

/**
 * A multipart problem (multer): an oversized or malformed upload is the
 * request's fault, so it is a 400 like any other invalid input.
 */
function uploadDetail(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  if ((error as { name?: unknown }).name !== 'MulterError') return null
  return (error as { code?: unknown }).code === 'LIMIT_FILE_SIZE'
    ? 'The uploaded file is too large.'
    : 'The upload could not be read.'
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (error instanceof HttpError) {
    problem(res, error.status, error.message, error.errors)
    return
  }
  const rejectedUpload = uploadDetail(error)
  if (rejectedUpload) {
    problem(res, 400, rejectedUpload)
    return
  }
  logger.error({ err: error }, 'unhandled error')
  problem(res, 500, 'The server had a problem. Please try again.')
}
