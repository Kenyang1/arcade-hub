import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { SaveQuerySchema } from '@arcade-hub/contracts'
import { listSaves, openSaveFile } from '../core/saves.ts'
import { authenticate, requestDb, requestUser } from '../http/auth.ts'
import { HttpError, fieldErrors } from '../http/problem.ts'
import { logger } from '../logger.ts'

const router = Router()

/** GET /api/saves?gameId=: the signed-in player's saves, newest first. */
router.get('/', authenticate, async (req, res) => {
  const query = SaveQuerySchema.safeParse(req.query)
  if (!query.success) {
    throw new HttpError(400, 'Some of what you entered is not valid.', fieldErrors(query.error.issues))
  }
  const gameId = query.data.gameId
  if (gameId && !ObjectId.isValid(gameId)) {
    throw new HttpError(400, 'Some of what you entered is not valid.', {
      gameId: ['Must be the id of a game.'],
    })
  }

  res.json(await listSaves(requestDb(res), requestUser(res), gameId))
})

/**
 * GET /api/saves/{id}/file: the save state EmulatorJS resumes from, for the
 * player who owns it. Signed in, unlike the game file: a save state is private
 * to one account (see CLAUDE.md, "Auth").
 */
router.get('/:id/file', authenticate, async (req, res) => {
  const userId = requestUser(res)
  const saveId = String(req.params.id ?? '')
  const file = await openSaveFile(requestDb(res), userId, saveId)

  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Length', file.length)
  file.stream.on('error', (error) => {
    logger.error({ err: error, saveId, userId: userId.toHexString() }, 'save file stream failed')
    res.destroy(error)
  })
  res.on('close', () => {
    file.stream.destroy()
  })
  file.stream.pipe(res)
})

export default router
