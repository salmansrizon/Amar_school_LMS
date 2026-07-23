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
    // Integration suites build their fixtures in beforeAll against live
    // Supabase; the default 10s hook budget is tighter than the test budget.
    hookTimeout: 30000,
    // Integration tests share seeded rows (Test School A/B) — run files serially.
    fileParallelism: false,
  },
}))
