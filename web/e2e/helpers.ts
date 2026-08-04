import { expect, type Page } from '@playwright/test'

// Shared login for the per-role E2E smoke. Seeded users (seed-test.sql +
// e2e-seed.sql) all share this password.
export const PASSWORD = 'test-password-123!'

export interface RoleCase {
  role: string
  email: string
  home: RegExp
}

/** One login user per role. */
export const ROLES: RoleCase[] = [
  { role: 'School Owner', email: 'owner-a@test.local', home: /\/school(\/|$)/ },
  { role: 'Staff User', email: 'staff-e2e@test.local', home: /\/school(\/|$)/ },
  { role: 'Super Admin', email: 'super@test.local', home: /\/super-admin(\/|$)/ },
  { role: 'Distributor', email: 'dealer-e2e@test.local', home: /\/dealer(\/|$)/ },
  { role: 'Gov Official', email: 'gov-e2e@test.local', home: /\/gov(\/|$)/ },
]

/** Log in via the UI and wait for the role's home route. */
export async function login(page: Page, email: string, home: RegExp): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(home, { timeout: 20_000 })
}

/** Assert the page rendered without a Next.js error overlay / client crash.
 * Deliberately narrow — substrings like "500" or "error" appear in legit UI. */
export async function expectNoError(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible()
  // Next.js dev keeps an always-present <nextjs-portal>; only a real overlay has
  // a dialog with the error label. Match that, not the container.
  await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
  await expect(
    page.getByText('Application error: a client-side exception has occurred', { exact: false }),
  ).toHaveCount(0)
}
