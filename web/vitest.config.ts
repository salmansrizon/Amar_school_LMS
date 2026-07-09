import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    env: loadEnv(mode, __dirname, ''),
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
    // Integration tests share seeded rows (Test School A/B) — run files serially.
    fileParallelism: false,
  },
}))
