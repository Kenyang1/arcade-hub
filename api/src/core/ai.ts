import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { config } from '../config.ts'
import { logger } from '../logger.ts'

// The only module that talks to an AI provider (see
// docs/plans/2026-11-10-ai-integration.md). Everything else asks it for a
// label and gets a label or null back: a failed AI call never fails the
// request that needed it.

/** Largest frame we send. An NES frame as PNG is a few kilobytes. */
export const MAX_FRAME_BYTES = 2 * 1024 * 1024

/** Below this confidence a label is dropped, and the save shows its time instead. */
export const MIN_LABEL_CONFIDENCE = 0.5

/** Longest readme text sent with a frame, so one long readme can't blow the quota. */
const MAX_README_CHARS = 4000

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** What the model must answer with. Anything else is treated as a failed call. */
export const FrameLabelSchema = z.object({
  /** Where the player is, as shown on screen, or null when the frame shows nothing useful. */
  label: z.string().trim().min(1).max(60).nullable(),
  /** How sure the model is that the label matches the screen, from 0 to 1. */
  confidence: z.number().min(0).max(1),
})
export type FrameLabel = z.infer<typeof FrameLabelSchema>

const frameLabelJsonSchema = z.toJSONSchema(FrameLabelSchema)

/** The game a frame comes from. `id` is only used in logs. */
export type FrameGame = {
  id?: string
  title: string
  readme?: string
}

/**
 * One call to a vision model: a prompt and a PNG in, the model's JSON text out.
 * Tests pass a fake; the app uses Gemini.
 */
export type VisionModel = (request: {
  prompt: string
  png: Buffer
  jsonSchema: unknown
}) => Promise<string | undefined>

let gemini: VisionModel | null | undefined

/** The Gemini-backed model, or null when GEMINI_API_KEY is not set. */
export function defaultVisionModel(): VisionModel | null {
  if (gemini !== undefined) return gemini
  if (!config.geminiApiKey) {
    gemini = null
    return gemini
  }
  const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey,
    httpOptions: { timeout: config.aiTimeoutMs },
  })
  gemini = async ({ prompt, png, jsonSchema }) => {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: png.toString('base64') } },
            { text: prompt },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
    })
    return response.text
  }
  return gemini
}

/** The instructions sent with a frame. The readme is the game's own text, trimmed. */
export function labelPrompt(game: FrameGame): string {
  const lines = [
    'You write labels for save states in Arcade Hub, an arcade of retro games.',
    `The image is one frame from the game "${game.title}".`,
    'Write a label of at most 60 characters that tells the player where they were,',
    'using only what is visible on screen: for example the level, stage, score,',
    'lives or time left, like "Level 12, 0:45 left".',
    'Do not guess anything the screen does not show.',
    'If the frame is a title screen, a menu, or shows nothing you can read, set label to null.',
    'Set confidence from 0 to 1 for how sure you are that the label matches the screen.',
  ]
  const readme = game.readme?.trim()
  if (readme) {
    lines.push('', 'About this game, from its readme:', readme.slice(0, MAX_README_CHARS))
  }
  return lines.join('\n')
}

function isPng(bytes: Buffer): boolean {
  return bytes.length > PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
}

/** The parts of a provider error that are safe to log: never the request, the frame or the key. */
function errorFields(error: unknown): { status?: number; message: string } {
  const status = (error as { status?: unknown }).status
  const message = error instanceof Error ? error.message : String(error)
  return typeof status === 'number' ? { status, message } : { message }
}

/**
 * Reads a game frame and returns a short label for it. Returns null when the AI
 * is turned off, the frame is not a usable PNG, or the call fails for any
 * reason (timeout, rate limit, quota, bad answer). A label below
 * MIN_LABEL_CONFIDENCE comes back as `label: null`.
 */
export async function labelFrame(
  png: Buffer,
  game: FrameGame,
  model: VisionModel | null = defaultVisionModel(),
): Promise<FrameLabel | null> {
  const fields = { gameId: game.id }
  if (!model) {
    logger.debug(fields, 'ai: no GEMINI_API_KEY, frame not labelled')
    return null
  }
  if (!isPng(png) || png.length > MAX_FRAME_BYTES) {
    logger.warn({ ...fields, bytes: png.length }, 'ai: frame is not a PNG under the size limit')
    return null
  }

  let text: string | undefined
  try {
    text = await model({ prompt: labelPrompt(game), png, jsonSchema: frameLabelJsonSchema })
  } catch (error) {
    logger.warn({ ...fields, ...errorFields(error) }, 'ai: label call failed')
    return null
  }

  let answer: unknown
  try {
    answer = JSON.parse(text ?? '')
  } catch {
    logger.warn(fields, 'ai: label answer was not JSON')
    return null
  }
  const parsed = FrameLabelSchema.safeParse(answer)
  if (!parsed.success) {
    logger.warn(fields, 'ai: label answer did not match the schema')
    return null
  }

  const { label, confidence } = parsed.data
  return { label: confidence >= MIN_LABEL_CONFIDENCE ? label : null, confidence }
}
