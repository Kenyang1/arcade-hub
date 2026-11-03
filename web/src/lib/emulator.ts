// The only module that touches EmulatorJS (the EJS_* globals). Pages call these
// functions and never read window.EJS_* themselves (see CLAUDE.md, "EmulatorJS").
// EmulatorJS is served from our own origin under /emulatorjs/, fetched by
// `pnpm --dir web emulator:fetch`. Written against EmulatorJS 4.2.3
// (data/loader.js, data/src/emulator.js, data/src/GameManager.js).

import type { EmulatorCore } from './types.ts'

const DATA_PATH = '/emulatorjs/data/'

/** The parts of window.EJS_emulator this module uses. */
interface EmulatorInstance {
  started: boolean
  paused: boolean
  /** Set by EmulatorJS when the game or its core fails to download or start. */
  failedToStart?: boolean
  play: () => void
  pause: () => void
  on: (event: string, handler: () => void) => void
  gameManager?: {
    getState: () => Uint8Array
    loadState: (state: Uint8Array) => void
    toggleMainLoop: (playing: 0 | 1) => void
  }
}

declare global {
  interface Window {
    EJS_player?: string
    EJS_core?: string
    EJS_gameUrl?: string
    EJS_gameName?: string
    EJS_pathtodata?: string
    EJS_startOnLoaded?: boolean
    EJS_loadStateURL?: string
    EJS_language?: string
    EJS_disableAutoLang?: boolean
    EJS_paths?: Record<string, string>
    EJS_CacheLimit?: number
    EJS_ready?: () => void
    EJS_onGameStart?: () => void
    EJS_emulator?: EmulatorInstance
    /** The class emulator.min.js defines. Present once the build has loaded. */
    EmulatorJS?: unknown
  }
}

const GLOBALS = [
  'EJS_player',
  'EJS_core',
  'EJS_gameUrl',
  'EJS_gameName',
  'EJS_pathtodata',
  'EJS_startOnLoaded',
  'EJS_loadStateURL',
  'EJS_language',
  'EJS_disableAutoLang',
  'EJS_paths',
  'EJS_CacheLimit',
  'EJS_ready',
  'EJS_onGameStart',
  'EJS_emulator',
] as const

// emulator.min.js declares a top-level class, so loading it a second time
// throws. On later starts the loader is pointed at empty files instead, and
// the class from the first load is reused.
const EMPTY_SCRIPT = 'data:text/javascript,'
const EMPTY_STYLE = 'data:text/css,'

/** How long start() waits for the game to run before it gives up. */
const START_TIMEOUT_MS = 30_000

/**
 * The cores `emulator:fetch` downloads (config.emulatorjs.cores in
 * web/package.json), by system. A core that isn't here would make EmulatorJS
 * fetch it from its public CDN, which we never do, so start() refuses it.
 */
const SUPPORTED_CORES: Partial<Record<EmulatorCore, string>> = { nes: 'fceumm' }

const FILE_EXTENSIONS: Record<EmulatorCore, string> = { nes: 'nes', snes: 'sfc', gb: 'gb', gba: 'gba' }

/** The bytes a game file starts with, for the systems we can run: "NES" and 0x1A (iNES). */
const FILE_HEADERS: Partial<Record<EmulatorCore, number[]>> = { nes: [0x4e, 0x45, 0x53, 0x1a] }

/** Whether this build can run games for the system. */
export function isCoreSupported(core: EmulatorCore): boolean {
  return core in SUPPORTED_CORES
}

/** The usual game file extension for the system, for StartOptions.gameName. */
export function fileExtension(core: EmulatorCore): string {
  return FILE_EXTENSIONS[core]
}

/**
 * Whether the file starts like a game for this system. EmulatorJS 4.2.3 reports
 * no failure for a file its core rejects: it shows the RetroArch menu and fires
 * its start event, so this is checked before start(). A damaged game with a good
 * header still gets through.
 */
export async function isGameFile(file: Blob, core: EmulatorCore): Promise<boolean> {
  const header = FILE_HEADERS[core]
  if (!header) return true
  const bytes = new Uint8Array(await file.slice(0, header.length).arrayBuffer())
  return header.every((byte, index) => bytes[index] === byte)
}

export interface StartOptions {
  /** The element the emulator renders into. It must have an id. */
  container: HTMLElement
  core: EmulatorCore
  /**
   * A blob: URL of the game file: the bytes from api.downloadGameFile, or a file
   * the player picked. A plain API URL works too, but EmulatorJS then names the
   * file after the URL's last segment ("file"), with no extension.
   */
  gameUrl: string
  /**
   * For a blob: URL, EmulatorJS 4.2.3 names the game file from this, so include
   * the file extension (for example "homebrew.nes"), or the core may not recognise it.
   */
  gameName?: string
  /** URL of a save state to load as soon as the game starts (api.saveFileUrl). */
  saveStateUrl?: string | null
}

let loaderScript: HTMLScriptElement | null = null
/** Clears the watchers of the start() call in flight, if any. */
let cancelStartWatch: (() => void) | null = null
/** Removes the Tab listeners of the running game, if any. */
let releaseTab: (() => void) | null = null

/**
 * EmulatorJS 4.2.3 calls preventDefault on every key that reaches its game area,
 * so Tab could never leave the game. Stop Tab before EmulatorJS sees it, and the
 * browser moves focus as usual. No NES button is mapped to Tab.
 */
function letTabLeaveTheGame(container: HTMLElement): () => void {
  const passTab = (event: KeyboardEvent) => {
    if (event.key === 'Tab') event.stopImmediatePropagation()
  }
  container.addEventListener('keydown', passTab, true)
  container.addEventListener('keyup', passTab, true)
  return () => {
    container.removeEventListener('keydown', passTab, true)
    container.removeEventListener('keyup', passTab, true)
  }
}

/**
 * Loads EmulatorJS into the container and starts the game. Resolves once the
 * game runs, so a save state can be taken. Rejects when the build is missing,
 * the core isn't one we serve, the game fails to start, or it hasn't started
 * after 30 s. Only one emulator runs at a time.
 */
export function start(options: StartOptions): Promise<void> {
  stop()
  if (!options.container.id) {
    return Promise.reject(new Error('The emulator container needs an id.'))
  }
  if (!isCoreSupported(options.core)) {
    return Promise.reject(
      new Error(`${options.core.toUpperCase()} games can't be played here yet. Only NES games run for now.`),
    )
  }

  return new Promise<void>((resolve, reject) => {
    // EmulatorJS 4.2.3 reports some failures (a game or core that won't
    // download, a save state that won't load) only on its own screen, by setting
    // failedToStart. Poll for it, with a timeout as a last resort, so the page
    // never waits forever.
    const poll = window.setInterval(() => {
      if (window.EJS_emulator?.failedToStart) fail('The game could not start. Check the browser console.')
    }, 250)
    const timeout = window.setTimeout(() => {
      fail('The game did not start within 30 seconds. Check the browser console.')
    }, START_TIMEOUT_MS)
    const clearWatch = () => {
      window.clearInterval(poll)
      window.clearTimeout(timeout)
      if (cancelStartWatch === clearWatch) cancelStartWatch = null
    }
    cancelStartWatch = clearWatch
    let settled = false
    function fail(message: string) {
      // Ignore a start that already settled, or that stop() or a newer start
      // cancelled: its stop() would tear down the game that replaced it.
      if (settled || cancelStartWatch !== clearWatch) return
      settled = true
      clearWatch()
      stop()
      reject(new Error(message))
    }

    releaseTab = letTabLeaveTheGame(options.container)
    window.EJS_player = `#${options.container.id}`
    window.EJS_core = options.core
    window.EJS_gameUrl = options.gameUrl
    window.EJS_gameName = options.gameName
    window.EJS_pathtodata = DATA_PATH
    window.EJS_startOnLoaded = true
    window.EJS_loadStateURL = options.saveStateUrl ?? undefined
    // English only. This also stops the loader from requesting localization/<locale>.json.
    window.EJS_language = 'en-US'
    window.EJS_disableAutoLang = false
    // No ROM cache. With a blob: URL EmulatorJS would store a new copy of the
    // game in IndexedDB on every start, under a random key it never reads back.
    window.EJS_CacheLimit = 0
    if (window.EmulatorJS) {
      window.EJS_paths = { 'emulator.min.js': EMPTY_SCRIPT, 'emulator.min.css': EMPTY_STYLE }
    }
    window.EJS_ready = () => {
      window.EJS_emulator?.on('exit', () => fail('The game could not start. Check the browser console.'))
    }
    window.EJS_onGameStart = () => {
      if (settled) return
      settled = true
      clearWatch()
      // EmulatorJS sets tabindex -1, which would leave no way to Tab back to the game.
      options.container.tabIndex = 0
      resolve()
    }

    loaderScript = document.createElement('script')
    loaderScript.src = `${DATA_PATH}loader.js`
    loaderScript.onerror = () => fail('EmulatorJS is missing. Run: pnpm --dir web emulator:fetch')
    document.body.append(loaderScript)
  })
}

/** Moves keyboard focus to the game, so keys go to it again after a button press. */
export function focus(): void {
  if (window.EJS_player) document.querySelector<HTMLElement>(window.EJS_player)?.focus()
}

export function isRunning(): boolean {
  return window.EJS_emulator?.started === true
}

export function isPaused(): boolean {
  return window.EJS_emulator?.paused === true
}

export function pause(): void {
  instance().pause()
}

export function resume(): void {
  instance().play()
}

/** The current save state as bytes, ready to upload. */
export function getSaveState(): Uint8Array {
  return gameManager().getState()
}

/** Loads a save state taken earlier with getSaveState, or downloaded from the API. */
export function loadSaveState(state: Uint8Array): void {
  gameManager().loadState(state)
}

/**
 * Stops the emulator and clears the EJS_* globals. EmulatorJS 4.2.3 has no
 * teardown API, so this halts the main loop and removes what it put on the page.
 */
export function stop(): void {
  cancelStartWatch?.()
  releaseTab?.()
  releaseTab = null
  if (window.EJS_emulator?.started) window.EJS_emulator.gameManager?.toggleMainLoop(0)
  loaderScript?.remove()
  loaderScript = null
  if (window.EJS_player) document.querySelector(window.EJS_player)?.replaceChildren()
  for (const name of GLOBALS) delete window[name]
}

function instance(): EmulatorInstance {
  const emulator = window.EJS_emulator
  if (!emulator?.started) throw new Error('No game is running.')
  return emulator
}

function gameManager() {
  const manager = instance().gameManager
  if (!manager) throw new Error('No game is running.')
  return manager
}
