import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

// Manual model evals (issue #672) — kept out of `npm test` and CI because they
// call a paid external API. Run: npm run eval:behaviour-triage
// Standalone rather than mergeConfig(vitest.config): mergeConfig concatenates
// `include`, which would pull the whole test suite into an eval run.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    env: loadEnv(mode, __dirname, ''),
    include: ['evals/**/*.eval.ts'],
  },
}))
