import { describe, expect, it, vi } from 'vitest'
import {
  defaultVisionModel,
  labelFrame,
  labelPrompt,
  MAX_FRAME_BYTES,
  type VisionModel,
} from '../src/core/ai.ts'

// No real AI calls: every test passes a fake VisionModel. No MongoDB needed.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const frame = Buffer.from([...PNG_SIGNATURE, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
const game = { id: 'game-1', title: 'Bomb Sweeper', readme: 'Move the walls to reach the bomb.' }

/** A fake model that answers with this text, and records what it was sent. */
function answering(text: string | undefined) {
  return vi.fn<VisionModel>(async () => text)
}

describe('labelFrame', () => {
  it('returns the label and confidence the model gives', async () => {
    const model = answering(JSON.stringify({ label: 'Level 12, 0:45 left', confidence: 0.9 }))

    await expect(labelFrame(frame, game, model)).resolves.toEqual({
      label: 'Level 12, 0:45 left',
      confidence: 0.9,
    })
    const request = model.mock.calls[0]?.[0]
    expect(request?.png).toBe(frame)
    expect(request?.prompt).toContain('Bomb Sweeper')
    expect(request?.jsonSchema).toMatchObject({ type: 'object' })
  })

  it('drops a label the model is not sure about', async () => {
    const model = answering(JSON.stringify({ label: 'Level 3', confidence: 0.2 }))
    await expect(labelFrame(frame, game, model)).resolves.toEqual({ label: null, confidence: 0.2 })
  })

  it('passes on a null label for a title screen', async () => {
    const model = answering(JSON.stringify({ label: null, confidence: 0.95 }))
    await expect(labelFrame(frame, game, model)).resolves.toEqual({ label: null, confidence: 0.95 })
  })

  it('returns null when the answer is not JSON', async () => {
    await expect(labelFrame(frame, game, answering('Level 12'))).resolves.toBeNull()
  })

  it('returns null when there is no answer text', async () => {
    await expect(labelFrame(frame, game, answering(undefined))).resolves.toBeNull()
  })

  it('returns null when the answer does not match the schema', async () => {
    const tooLong = answering(JSON.stringify({ label: 'x'.repeat(61), confidence: 0.9 }))
    const noConfidence = answering(JSON.stringify({ label: 'Level 1' }))
    const outOfRange = answering(JSON.stringify({ label: 'Level 1', confidence: 3 }))

    await expect(labelFrame(frame, game, tooLong)).resolves.toBeNull()
    await expect(labelFrame(frame, game, noConfidence)).resolves.toBeNull()
    await expect(labelFrame(frame, game, outOfRange)).resolves.toBeNull()
  })

  it('returns null when the call fails, for example a rate limit', async () => {
    const model = vi.fn<VisionModel>(async () => {
      throw Object.assign(new Error('Resource has been exhausted'), { status: 429 })
    })
    await expect(labelFrame(frame, game, model)).resolves.toBeNull()
  })

  it('returns null without calling the model when the AI is turned off', async () => {
    await expect(labelFrame(frame, game, null)).resolves.toBeNull()
  })

  it('never sends something that is not a PNG', async () => {
    const model = answering(JSON.stringify({ label: 'Level 1', confidence: 0.9 }))

    await expect(labelFrame(Buffer.from('not an image'), game, model)).resolves.toBeNull()
    await expect(labelFrame(Buffer.alloc(0), game, model)).resolves.toBeNull()
    expect(model).not.toHaveBeenCalled()
  })

  it('never sends a frame over the size limit', async () => {
    const model = answering(JSON.stringify({ label: 'Level 1', confidence: 0.9 }))
    const huge = Buffer.concat([Buffer.from(PNG_SIGNATURE), Buffer.alloc(MAX_FRAME_BYTES)])

    await expect(labelFrame(huge, game, model)).resolves.toBeNull()
    expect(model).not.toHaveBeenCalled()
  })
})

describe('labelPrompt', () => {
  it('includes the readme, trimmed to a few thousand characters', () => {
    const prompt = labelPrompt({ title: 'Bomb Sweeper', readme: `Intro. ${'a'.repeat(10000)}` })
    expect(prompt).toContain('Intro.')
    expect(prompt.length).toBeLessThan(5000)
  })

  it('works without a readme', () => {
    expect(labelPrompt({ title: 'Bomb Sweeper' })).not.toContain('readme')
  })
})

describe('defaultVisionModel', () => {
  it('is off when GEMINI_API_KEY is not set, as in tests', () => {
    expect(defaultVisionModel()).toBeNull()
  })
})
