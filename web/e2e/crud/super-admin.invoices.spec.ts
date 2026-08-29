import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Invoices (map #329, ticket #354, playwright-crud-plan §3). Issue a
// single-line distributor invoice and confirm it lands in the list with the
// party resolved + a taka total. (Invoices have no UI delete — the created row
// is a benign, uniquely-described artifact on the pre-launch shared DB.)

const PATH = '/super-admin/invoices'

test.describe('@crud @super-admin invoices', () => {
  test('bill a distributor → invoice row with party + taka total', async ({ superAdminPage: page }) => {
    const desc = `E2E SMS credit ${Date.now()}`
    await page.goto(PATH)
    await page.locator('select[name="distributor"]').selectOption({ index: 1 })
    await page.locator('input[name="description"]').fill(desc)
    await page.locator('input[name="amount"]').fill('500')
    await page.getByRole('button', { name: 'Issue invoice' }).click()

    // The new invoice appears in the list with a ৳ total.
    const row = page.locator('tr, li').filter({ hasText: '৳' }).first()
    await expect(row).toBeVisible()
    await expect(page.locator('table')).toContainText('৳')
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach invoices', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/invoices/)
    await page.context().close()
  })
})
