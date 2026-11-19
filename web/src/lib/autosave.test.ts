import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_MS, startAutosave } from './autosave.ts'

describe('startAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves once every 60 seconds, not before', async () => {
    const save = vi.fn(async () => 'saved')
    const onSaved = vi.fn()
    const stop = startAutosave({ canSave: () => true, save, onSaved, onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith('saved')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2)
    expect(save).toHaveBeenCalledTimes(3)
    stop()
  })

  it('skips a tick while canSave says no, for example while paused', async () => {
    let paused = true
    const save = vi.fn(async () => 'saved')
    const stop = startAutosave({ canSave: () => !paused, save, onSaved: vi.fn(), onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(save).not.toHaveBeenCalled()
    paused = false
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(save).toHaveBeenCalledTimes(1)
    stop()
  })

  it('never starts a second upload while one is still going', async () => {
    let finish: (value: string) => void = () => {}
    const save = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))
    const stop = startAutosave({ canSave: () => true, save, onSaved: vi.fn(), onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 3)
    expect(save).toHaveBeenCalledTimes(1)
    finish('saved')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(save).toHaveBeenCalledTimes(2)
    stop()
  })

  it('reports a failed autosave and tries again on the next tick', async () => {
    const save = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('saved')
    const onSaved = vi.fn()
    const onError = vi.fn()
    const stop = startAutosave({ canSave: () => true, save, onSaved, onError })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(onError).toHaveBeenCalledWith(new Error('offline'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(onSaved).toHaveBeenCalledWith('saved')
    stop()
  })

  it('treats a save that throws before uploading as a failed autosave', async () => {
    const onError = vi.fn()
    const stop = startAutosave<string>({
      canSave: () => true,
      save: () => {
        throw new Error('no state yet')
      },
      onSaved: vi.fn(),
      onError,
    })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(onError).toHaveBeenCalledWith(new Error('no state yet'))
    stop()
  })

  it('stops saving and reports nothing late after stop', async () => {
    let finish: (value: string) => void = () => {}
    const save = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))
    const onSaved = vi.fn()
    const stop = startAutosave({ canSave: () => true, save, onSaved, onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    stop()
    finish('saved')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 3)
    expect(save).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
