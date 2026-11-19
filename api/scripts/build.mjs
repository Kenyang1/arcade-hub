// Emits the API for the image. `pnpm build` runs `tsc --noEmit` first, so the
// types are still checked by TypeScript; esbuild only writes the JavaScript.
// It bundles @arcade-hub/contracts, which ships TypeScript source, because Node
// cannot import a .ts file from node_modules. Installed packages stay external.

import { build } from 'esbuild'

await build({
  entryPoints: ['src/server.ts', 'src/jobs/cli.ts'],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // CommonJS packages that use require() inside (jsonwebtoken, multer) can't be
  // bundled into ESM output: the built server would crash on start. Keep every
  // installed package external, and add new ones here as they arrive.
  external: [
    '@google/genai',
    'express',
    'jsonwebtoken',
    'mongodb',
    'multer',
    'pino',
    'swagger-ui-express',
    'zod',
  ],
  logLevel: 'info',
})
