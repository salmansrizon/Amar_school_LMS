import { defineConfig, devices } from '@playwright/test'

// E2E config for the ui.md enhancement suite (map #140). Runs against an
// already-running app — point it at a local dev server or a deploy with
// PLAYWRIGHT_BASE_URL. Kept separate from the vitest unit/integration config;
// Playwright owns tests/e2e/**, vitest owns tests/unit + tests/integration.
//
// Auth happens once in the `setup` project (auth.setup.ts), which saves a
// storageState the feature tests reuse — one login instead of one-per-test, so
// the auth backend isn't rate-limited and the suite is fast and stable.
const authFile = 'playwright/.auth/owner.json'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // the checklist test mutates shared template rows
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3140',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
    },
  ],
})
