import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Every file shares one database, and each one wipes the collections it
    // uses, so files must not run at the same time.
    fileParallelism: false,
    // Tests need a real MongoDB (`docker compose up -d mongo`) and use their own
    // database, so a run never touches the development one. These variables are
    // set before any module reads process.env (see src/config.ts).
    env: {
      NODE_ENV: 'test',
      MONGO_DB: 'arcadehub_test',
      JWT_SIGNING_KEY: 'test-signing-key-not-a-secret',
      JWT_ISSUER: 'arcade-hub',
    },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
