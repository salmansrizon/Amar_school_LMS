import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load .env.local into the test-runner process too (not just the app's webServer)
// so specs can spin up a supabase client to seed preconditions (e.g. start a
// workflow instance for the approvals decide test).
dotenv.config({ path: '.env.local' })

// E2E config (map #258 verification). Runs Chromium against a local `next dev`
// server that talks to the shared Supabase test project (.env.local). Serial
// (workers=1) so the shared test data + auth rate limits stay predictable.
//
// E2E_PORT lets a run take its own port. Default 3000 keeps the previous
// behaviour; set it when a dev server is already sitting on 3000, so the suite
// starts its own rather than silently testing whatever is already there —
// possibly a different branch's code (map #373).
const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = `http://localhost:${PORT}`
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Per-role auth: logs in each role once, writes e2e/.auth/<key>.json.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /global\.setup\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
