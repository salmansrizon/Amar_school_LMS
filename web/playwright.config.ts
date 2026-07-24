import { defineConfig, devices } from '@playwright/test'

// E2E config for the ui.md enhancement suite (map #140). Runs against an
// already-running app — point it at a local dev server or a deploy with
// PLAYWRIGHT_BASE_URL. Kept separate from the vitest unit/integration config;
// Playwright owns tests/e2e/**, vitest owns tests/unit + tests/integration.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // the checklist test mutates shared template rows
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3140',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
