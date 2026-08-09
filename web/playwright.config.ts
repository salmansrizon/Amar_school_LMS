import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load .env.local into the test-runner process too (not just the app's webServer)
// so specs can spin up a supabase client to seed preconditions (e.g. start a
// workflow instance for the approvals decide test).
dotenv.config({ path: '.env.local' })

// E2E config (map #258 verification). Runs Chromium against a local `next dev`
// server that talks to the shared Supabase test project (.env.local). Serial
// (workers=1) so the shared test data + auth rate limits stay predictable.
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
    baseURL: 'http://localhost:3000',
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
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
