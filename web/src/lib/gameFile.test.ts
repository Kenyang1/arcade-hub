// The Add a game page's file check: the name must end in an extension the
// chosen console takes, and the file can't be empty. The server checks the rest.
import { describe, expect, it } from 'vitest'
import { CORES, extensionsFor, gameFileProblem } from './gameFile.ts'

describe('extensionsFor', () => {
  it('lists the extensions for each console', () => {
    expect(extensionsFor('nes')).toEqual(['.nes'])
    expect(extensionsFor('snes')).toEqual(['.sfc', '.smc'])
    expect(extensionsFor('gb')).toEqual(['.gb', '.gbc'])
    expect(extensionsFor('gba')).toEqual(['.gba'])
  })

  it('covers every console the form offers', () => {
    for (const { core } of CORES) expect(extensionsFor(core).length).toBeGreaterThan(0)
  })
})

describe('gameFileProblem', () => {
  it('accepts a file with the right extension, in any letter case', () => {
    expect(gameFileProblem('thwaite.nes', 24_592, 'nes')).toBeNull()
    expect(gameFileProblem('THWAITE.NES', 24_592, 'nes')).toBeNull()
    expect(gameFileProblem('game.smc', 1024, 'snes')).toBeNull()
    expect(gameFileProblem('game.gbc', 1024, 'gb')).toBeNull()
  })

  it('names the extensions the console takes when the file has another', () => {
    expect(gameFileProblem('thwaite.zip', 24_592, 'nes')).toBe('A NES game file ends in .nes.')
    expect(gameFileProblem('game.nes', 1024, 'snes')).toBe('A SNES game file ends in .sfc or .smc.')
  })

  it('does not accept the extension in the middle of the name', () => {
    expect(gameFileProblem('thwaite.nes.txt', 24_592, 'nes')).toBe('A NES game file ends in .nes.')
  })

  it('rejects an empty file', () => {
    expect(gameFileProblem('thwaite.nes', 0, 'nes')).toBe('That file is empty.')
  })
})
