import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Roles & Permissions matrix (map #329, ticket #349,
// playwright-crud-plan §3). Toggle a grant cell and confirm it flips; restore to
// the original grant so the audited role_permissions state is left unchanged.
// (Optimistic-revert-on-error needs an induced RPC failure — not UI-reachable;
// noted in the gap analysis.)

const PATH = '/super-admin/role-permissions'

test.describe('@crud @super-admin roles', () => {
  test('matrix renders; toggle a cell grant/revoke and restore', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible()

    const cell = page.locator('button[aria-label*="for "]').first()
    await expect(cell).toBeVisible()
    const before = await cell.getAttribute('aria-pressed')
    const flipped = before === 'true' ? 'false' : 'true'

    await cell.click()
    await expect(cell).toHaveAttribute('aria-pressed', flipped)
    // Restore original grant.
    await cell.click()
    await expect(cell).toHaveAttribute('aria-pressed', before ?? 'false')
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach role-permissions', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/role-permissions/)
    await page.context().close()
  })
})
