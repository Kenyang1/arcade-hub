import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { labelFrame } from '../src/core/ai.ts'
import { config } from '../src/config.ts'

// The AI plan's proof of concept and accuracy check: labels every PNG in a
// folder with the real Gemini model and prints the result next to the label
// you expected.
//
//   pnpm --dir api ai:label <folder> [game title]
//
// The folder lives outside the repo. It holds PNG screenshots of one game,
// optionally that game's readme.txt, and optionally an expected.json that
// maps a file name to the label you'd write yourself, for example
// { "level-12.png": "Level 12, 0:45 left" }. Needs GEMINI_API_KEY in .env.

const [folder, title = 'Bomb Sweeper'] = process.argv.slice(2)
if (!folder) {
  console.error('Usage: pnpm --dir api ai:label <folder> [game title]')
  process.exit(1)
}
if (!config.geminiApiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to the .env file at the repo root.')
  process.exit(1)
}

const readmePath = join(folder, 'readme.txt')
const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : undefined
const expectedPath = join(folder, 'expected.json')
const expected: Record<string, string> = existsSync(expectedPath)
  ? JSON.parse(readFileSync(expectedPath, 'utf8'))
  : {}

const frames = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.png')).sort()
if (frames.length === 0) {
  console.error(`No .png files in ${folder}`)
  process.exit(1)
}

console.log(`Model ${config.geminiModel}, game "${title}", ${frames.length} frames${readme ? ', with readme' : ''}\n`)
let labelled = 0
for (const name of frames) {
  const started = Date.now()
  const result = await labelFrame(readFileSync(join(folder, name)), { title, readme })
  const ms = Date.now() - started
  if (result?.label) labelled += 1

  console.log(name)
  console.log(`  label:    ${result ? (result.label ?? '(none)') : '(call failed, see the log above)'}`)
  if (result) console.log(`  sure:     ${Math.round(result.confidence * 100)}%`)
  if (expected[name]) console.log(`  expected: ${expected[name]}`)
  console.log(`  time:     ${ms} ms\n`)
}
console.log(`${labelled} of ${frames.length} frames got a label. Compare them with what you expected and record the result in the plan.`)
