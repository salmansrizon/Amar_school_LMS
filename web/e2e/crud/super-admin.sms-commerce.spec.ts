import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin SMS commerce (map #329, ticket #350, playwright-crud-plan §3).
// Create/activate/delete a sellable package + save a per-route segment rate
// (restored after). Self-contained.

const PATH = '/super-admin/sms-commerce'

test.describe('@crud @super-admin sms-commerce', () => {
  test('package create → activate/deactivate → delete', async ({ superAdminPage: page }) => {
    const name = `E2E Pack ${Date.now()}`
    await page.goto(PATH)
    await page.locator('input[name="name_en"]').fill(name)
    await page.locator('input[name="segments"]').fill('1000')
    await page.locator('input[name="price"]').fill('100')
    await page.getByRole('button', { name: 'Add package' }).click()

    const row = page.locator('tr', { hasText: name })
    await expect(row).toBeVisible()
    await expect(row).toContainText('1,000')
    await expect(row).toContainText('৳')
    await expect(row).toContainText('active')

    await row.getByRole('button', { name: 'Deactivate' }).click()
    await expect(row).toContainText('inactive')
    await row.getByRole('button', { name: 'Activate' }).click()
    await expect(row).toContainText('active')

    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0)
    await expectNoError(page)
  })

  test('segment rate saves (taka) and round-trips; restored', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    // Scope to the `mask` RateForm (exact span, so `non_mask` is excluded).
    const maskForm = page.locator('form').filter({ has: page.getByText('mask', { exact: true }) })
    const amount = maskForm.locator('input[name="amount"]')
    const orig = await amount.inputValue()

    await amount.fill('0.55')
    await maskForm.getByRole('button', { name: 'Save' }).click()
    await page.reload()
    const maskAfter = page.locator('form').filter({ has: page.getByText('mask', { exact: true }) })
    await expect(maskAfter.locator('input[name="amount"]')).toHaveValue('0.55')

    // Restore.
    await maskAfter.locator('input[name="amount"]').fill(orig || '0.5')
    await maskAfter.getByRole('button', { name: 'Save' }).click()
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach sms-commerce', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/sms-commerce/)
    await page.context().close()
  })
})
