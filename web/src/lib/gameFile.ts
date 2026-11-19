import type { EmulatorCore } from './types.ts'

/** The consoles a player can pick, with the game-file extensions each one takes. */
export const CORES: { core: EmulatorCore; label: string; extensions: string[] }[] = [
  { core: 'nes', label: 'NES', extensions: ['.nes'] },
  { core: 'snes', label: 'SNES', extensions: ['.sfc', '.smc'] },
  { core: 'gb', label: 'Game Boy', extensions: ['.gb', '.gbc'] },
  { core: 'gba', label: 'Game Boy Advance', extensions: ['.gba'] },
]

export function extensionsFor(core: EmulatorCore): string[] {
  return CORES.find((entry) => entry.core === core)?.extensions ?? []
}

/**
 * A plain message when the file can't be a game for this console, or null when
 * it looks right. Only the name and size are checked; the server checks the rest.
 */
export function gameFileProblem(fileName: string, size: number, core: EmulatorCore): string | null {
  const extensions = extensionsFor(core)
  const name = fileName.toLowerCase()
  if (!extensions.some((extension) => name.endsWith(extension))) {
    const label = CORES.find((entry) => entry.core === core)?.label ?? core
    return `A ${label} game file ends in ${extensions.join(' or ')}.`
  }
  if (size === 0) return 'That file is empty.'
  return null
}
