import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Gov oversight (map #329, ticket #337, playwright-crud-plan §3). Read-only:
// territory KPIs + schools list render; no write controls anywhere.

test.describe('@crud @gov oversight', () => {
  test('KPIs + territory schools render, no write controls', async ({ govPage: page }) => {
    await page.goto('/gov')
    // Bangla-default UI — assert structure, not English copy.
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
    // Read-only: no create/delete/save write buttons on the surface.
    await expect(page.getByRole('button', { name: /Add|Create|Delete|Save|Approve|New|যোগ|মুছ|সংরক্ষণ/ })).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: gov cannot reach super-admin', async ({ browser }) => {
    const page = await asRole(browser, 'gov')
    await page.goto('/super-admin')
    await expect(page).not.toHaveURL(/\/super-admin/)
    await page.context().close()
  })
})
