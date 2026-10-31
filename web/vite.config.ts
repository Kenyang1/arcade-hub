import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // One .env at the repo root serves both the API and the web app (see .env.example).
  // Vite only exposes the variables that start with VITE_.
  envDir: '..',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The API: pnpm --dir api dev
      '/api': 'http://localhost:5080',
    },
  },
})
