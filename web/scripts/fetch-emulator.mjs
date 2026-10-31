// Downloads the pinned EmulatorJS build into web/public/emulatorjs (gitignored).
// The version and the cores come from "config.emulatorjs" in web/package.json.
// Files come one at a time from the versioned EmulatorJS CDN, so there is no
// archive to extract and the script runs the same on Windows, macOS and Linux.
//
// Usage: pnpm --dir web emulator:fetch [--force]

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = fileURLToPath(new URL('..', import.meta.url))
const targetDir = path.join(webDir, 'public', 'emulatorjs')
const tempDir = path.join(webDir, 'public', 'emulatorjs.tmp')

const pkg = JSON.parse(await readFile(path.join(webDir, 'package.json'), 'utf8'))
const { version, cores } = pkg.config.emulatorjs
const force = process.argv.includes('--force')

const cdn = `https://cdn.emulatorjs.org/${version}/data/`
const licenseUrl = `https://raw.githubusercontent.com/EmulatorJS/EmulatorJS/v${version}/LICENSE`

// Everything the 4.x loader and emulator request at runtime outside debug mode.
const dataFiles = [
  'loader.js',
  'emulator.min.js',
  'emulator.min.css',
  'version.json',
  'compression/extract7z.js',
  'compression/extractzip.js',
  'compression/libunrar.js',
  'compression/libunrar.wasm',
]
for (const core of cores) {
  // The emulator picks the "-legacy" build when WebGL2 is unavailable. No
  // "-thread" build: threads need cross-origin isolation headers we do not send.
  dataFiles.push(
    `cores/${core}-wasm.data`,
    `cores/${core}-legacy-wasm.data`,
    `cores/reports/${core}.json`,
  )
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function isUpToDate() {
  const versionFile = path.join(targetDir, 'data', 'version.json')
  if (!(await exists(versionFile))) return false
  const installed = JSON.parse(await readFile(versionFile, 'utf8')).version
  if (installed !== version) return false
  for (const file of dataFiles) {
    if (!(await exists(path.join(targetDir, 'data', file)))) return false
  }
  return exists(path.join(targetDir, 'LICENSE'))
}

async function download(url, dest) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, bytes)
  return bytes.length
}

if (!force && (await isUpToDate())) {
  console.log(`EmulatorJS ${version} is already in ${targetDir}. Use --force to download it again.`)
  process.exit(0)
}

console.log(`Downloading EmulatorJS ${version} (cores: ${cores.join(', ')}) from ${cdn}`)
await rm(tempDir, { recursive: true, force: true })
let total = 0
for (const file of dataFiles) {
  const size = await download(cdn + file, path.join(tempDir, 'data', file))
  total += size
  console.log(`  ${file} (${Math.round(size / 1024)} KB)`)
}
// EmulatorJS is GPL-3.0. Its license stays next to the build.
await download(licenseUrl, path.join(tempDir, 'LICENSE'))
console.log('  LICENSE')

await rm(targetDir, { recursive: true, force: true })
await rename(tempDir, targetDir)
console.log(`Done: ${(total / 1024 / 1024).toFixed(1)} MB in ${targetDir}`)
