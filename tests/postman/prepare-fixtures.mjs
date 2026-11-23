// Writes the two tiny files the Postman collection uploads.
//
// They are generated rather than committed because game files and save states
// never go in git (see CLAUDE.md). Neither is a real game or save: they are a
// few bytes of text, and the API only checks the game file's name.
//
// If you change either string, update gameFileBytes and saveStateBytes in
// tests/local.postman_environment.json.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'fixtures')

await mkdir(fixtures, { recursive: true })
await writeFile(join(fixtures, 'test-game.nes'), 'Arcade Hub Postman test fixture. Not a game.\n')
await writeFile(
  join(fixtures, 'test-save-state.bin'),
  'Arcade Hub Postman save-state fixture. Not a save.\n',
)

console.log(`Wrote upload fixtures to ${fixtures}`)
