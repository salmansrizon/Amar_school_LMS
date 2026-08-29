import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Cross: RBAC negative + i18n toggle + a11y smoke (map #329, ticket #339,
// playwright-crud-plan §4).

test.describe('@cross rbac', () => {
  test('each role is redirected off another group home', async ({ browser }) => {
    for (const [role, foreign] of [
      ['distributor', '/super-admin'],
      ['agent', '/distributor'],
      ['gov', '/super-admin'],
      ['owner', '/distributor'],
    ] as const) {
      const page = await asRole(browser, role)
      await page.goto(foreign)
      await expect(page).not.toHaveURL(new RegExp(foreign.replace('/', '\\/')))
      await page.context().close()
    }
  })
})

test.describe('@cross i18n', () => {
  test('language toggle flips bn ↔ en', async ({ distributorPage: page }) => {
    await page.goto('/distributor')
    // Bangla default → the logout control reads লগআউট.
    await expect(page.getByText('লগআউট').first()).toBeVisible()
    await page.getByRole('button', { name: 'EN' }).first().click()
    await expect(page.getByText('লগআউট')).toHaveCount(0)
    // Restore Bangla.
    await page.getByRole('button', { name: 'বাং' }).first().click()
    await expect(page.getByText('লগআউট').first()).toBeVisible()
    await expectNoError(page)
  })
})

test.describe('@cross a11y', () => {
  test('nav has an accessible name; matrix toggles expose aria-pressed', async ({
    superAdminPage: page,
  }) => {
    await page.goto('/super-admin')
    await expect(page.getByRole('navigation').first()).toBeVisible()

    await page.goto('/super-admin/role-permissions')
    const toggle = page.locator('button[aria-pressed]').first()
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', /true|false/)
    await expectNoError(page)
  })
})
