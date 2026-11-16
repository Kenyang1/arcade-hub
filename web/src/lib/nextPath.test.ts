import { describe, expect, it } from 'vitest'
import { nextPath, signInLink } from './nextPath.ts'

describe('nextPath', () => {
  it('goes back to a path in this app', () => {
    expect(nextPath('/saves')).toBe('/saves')
    expect(nextPath('/play/abc?saveId=123')).toBe('/play/abc?saveId=123')
  })

  it('falls back to the library for anything else', () => {
    expect(nextPath(null)).toBe('/')
    expect(nextPath('')).toBe('/')
    expect(nextPath('https://example.com')).toBe('/')
    expect(nextPath('//example.com')).toBe('/')
    expect(nextPath('/\\example.com')).toBe('/')
  })

  it('round-trips through signInLink', () => {
    const link = signInLink('/play/abc?saveId=123')
    const next = new URLSearchParams(link.split('?')[1]).get('next')
    expect(link.startsWith('/sign-in?next=')).toBe(true)
    expect(nextPath(next)).toBe('/play/abc?saveId=123')
  })
})
