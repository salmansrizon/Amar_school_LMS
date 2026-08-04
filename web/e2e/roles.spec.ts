import { expect, test } from '@playwright/test'
import { expectNoError, login, ROLES } from './helpers'

// Every end: each role logs in and lands on its own route group without error.
test.describe('per-role login', () => {
  for (const c of ROLES) {
    test(`${c.role} logs in and lands on its home`, async ({ page }) => {
      await login(page, c.email, c.home)
      await expect(page).toHaveURL(c.home)
      await expectNoError(page)
    })
  }

  test('bad credentials are rejected (stay on /login)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('owner-a@test.local')
    await page.locator('#password').fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/login/)
  })
})
