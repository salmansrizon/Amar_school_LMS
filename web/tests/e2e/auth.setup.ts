import { test as setup, expect } from '@playwright/test'

// One-time login for the ui.md e2e suite: sign in as the seeded demo owner,
// switch the UI to English (stable selectors), and save the session so the
// feature tests reuse it instead of logging in per test (avoids auth
// rate-limiting and keeps the run fast).
const authFile = 'playwright/.auth/owner.json'
const EMAIL = process.env.E2E_EMAIL || 'demo.owner@amarschool.test'
const PASSWORD = process.env.E2E_PASSWORD || 'DemoOwner#2026'

setup('authenticate as demo owner', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await Promise.all([
    page.waitForURL(/\/school(\/|$)/, { timeout: 30_000 }),
    page.locator('button[type="submit"]').first().click(),
  ])
  // Flip to English so labels are language-stable; the choice is a cookie, so
  // it rides along in the saved storageState.
  const en = page.getByRole('button', { name: /^EN$/ }).or(page.getByText(/^EN$/))
  if (await en.count()) {
    await en.first().click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  await expect(page).toHaveURL(/\/school/)
  await page.context().storageState({ path: authFile })
})
