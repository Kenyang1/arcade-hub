import { Router } from 'express'
import { CredentialsSchema } from '@arcade-hub/contracts'
import { NewAccountSchema, registerUser, signIn } from '../core/auth.ts'
import { database } from '../core/mongo.ts'
import { HttpError, fieldErrors } from '../http/problem.ts'
import { logger } from '../logger.ts'

// Accounts and sign-in (M3). These are the only routes that take a password, so
// nothing here logs the request body: only the new or signed-in account's id
// (see CLAUDE.md, "Logging").

const router = Router()

/** POST /api/auth/register: create an account and sign in as it. */
router.post('/register', async (req, res) => {
  const body = NewAccountSchema.safeParse(req.body)
  if (!body.success) {
    // The Sign in page shows `detail` as it is, so it says what to fix, not just that something is wrong.
    const detail = [...new Set(body.error.issues.map((issue) => issue.message))].join(' ')
    throw new HttpError(400, detail, fieldErrors(body.error.issues))
  }

  const auth = await registerUser(await database(), body.data)
  logger.info({ userId: auth.user.id }, 'account created')
  res.status(201).json(auth)
})

/** POST /api/auth/login: sign in with a username and password. */
router.post('/login', async (req, res) => {
  const body = CredentialsSchema.safeParse(req.body)
  if (!body.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(body.error.issues))
  }

  const auth = await signIn(await database(), body.data.username, body.data.password)
  logger.info({ userId: auth.user.id }, 'signed in')
  res.json(auth)
})

export default router
