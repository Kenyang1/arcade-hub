// Save states the player exported on the Play page, kept in this tab's session
// storage so they survive a reload (Nov 8 demo, step 6). From M2 the state
// uploads to the API instead, and this module goes away.
// Save files never go to the API or to git from here.

const KEY_PREFIX = 'arcade-hub:exported-state:'

export interface ExportedState {
  bytes: Uint8Array
  exportedAt: Date
}

interface StoredState {
  base64: string
  exportedAt: string
}

/** The state exported for this game in this tab, or null if there is none. */
export function readExportedState(gameId: string): ExportedState | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + gameId)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredState
    return { bytes: fromBase64(stored.base64), exportedAt: new Date(stored.exportedAt) }
  } catch {
    return null
  }
}

/** Keeps the state for this game, replacing any earlier one. Throws a plain message if the browser refuses. */
export function writeExportedState(gameId: string, bytes: Uint8Array): ExportedState {
  const exportedAt = new Date()
  const stored: StoredState = { base64: toBase64(bytes), exportedAt: exportedAt.toISOString() }
  try {
    sessionStorage.setItem(KEY_PREFIX + gameId, JSON.stringify(stored))
  } catch {
    throw new Error('The browser would not keep the state. Its storage may be full or blocked.')
  }
  return { bytes, exportedAt }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
