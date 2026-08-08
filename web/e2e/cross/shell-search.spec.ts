import { test, expect, asRole } from '../fixtures/roles'
import type { RoleKey } from '../helpers'
import { expectNoError } from '../helpers'

// Cross: AppShell nav + ⌘K search palette (map #329, ticket #338,
// playwright-crud-plan §4). Each role lands on the shared shell with its nav; the
// command palette opens, accepts input, and closes.

test.describe('@cross shell + search', () => {
  for (const [role, home] of [
    ['super', '/super-admin'],
    ['distributor', '/distributor'],
    ['agent', '/agent'],
    ['gov', '/gov'],
  ] as [RoleKey, string][]) {
    test(`${role}: shared shell nav renders`, async ({ browser }) => {
      const page = await asRole(browser, role)
      await page.goto(home)
      await expect(page.getByRole('navigation').first()).toBeVisible()
      await expectNoError(page)
      await page.context().close()
    })
  }

  test('⌘K palette opens, accepts input, closes', async ({ superAdminPage: page }) => {
    await page.goto('/super-admin')
    // Open via the shell search trigger (⌘K label) — keyboard shortcut is flaky
    // headless, the button is the stable path.
    await page.getByRole('button', { name: /⌘K|খুঁজুন|Search/ }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('input').first().fill('co')
    // Palette stays open with the query; results (nav + records) populate.
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expectNoError(page)
  })
})
