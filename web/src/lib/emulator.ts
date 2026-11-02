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
  'EJS_ready',
  'EJS_onGameStart',
  'EJS_emulator',
] as const

// emulator.min.js declares a top-level class, so loading it a second time
// throws. On later starts the loader is pointed at empty files instead, and
// the class from the first load is reused.
const EMPTY_SCRIPT = 'data:text/javascript,'
const EMPTY_STYLE = 'data:text/css,'

export interface StartOptions {
  /** The element the emulator renders into. It must have an id. */
  container: HTMLElement
  core: EmulatorCore
  /** URL of the game file (api.gameFileUrl), or a blob: URL for a file the player picked. */
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

/**
 * Loads EmulatorJS into the container and starts the game. Resolves once the
 * game runs, so a save state can be taken. Rejects when the build is missing
 * or the game fails to start. Only one emulator runs at a time.
 */
export function start(options: StartOptions): Promise<void> {
  stop()
  if (!options.container.id) {
    return Promise.reject(new Error('The emulator container needs an id.'))
  }

  return new Promise<void>((resolve, reject) => {
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
    if (window.EmulatorJS) {
      window.EJS_paths = { 'emulator.min.js': EMPTY_SCRIPT, 'emulator.min.css': EMPTY_STYLE }
    }
    window.EJS_ready = () => {
      window.EJS_emulator?.on('exit', () => {
        reject(new Error('The game could not start. Check the browser console.'))
      })
    }
    window.EJS_onGameStart = () => resolve()

    loaderScript = document.createElement('script')
    loaderScript.src = `${DATA_PATH}loader.js`
    loaderScript.onerror = () => {
      stop()
      reject(new Error('EmulatorJS is missing. Run: pnpm --dir web emulator:fetch'))
    }
    document.body.append(loaderScript)
  })
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
