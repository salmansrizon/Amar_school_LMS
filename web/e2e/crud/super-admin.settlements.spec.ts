import { test, expect, asRole } from '../fixtures/roles'
import { expectInlineError, expectNoError } from '../helpers'

// Super-admin Settlements (map #329, ticket #351, playwright-crud-plan §3).
// Read the list + validate the run form. The full run→approve→pay happy path
// mutates the GL irreversibly and needs seeded accrued commissions — encoded as
// a documented gap (test.fixme) rather than polluting the shared DB.

const PATH = '/super-admin/settlements'

test.describe('@crud @super-admin settlements', () => {
  test('read: heading + table + distributor options render', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    await expect(page.getByRole('heading', { name: 'Settlements' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Unsettled' })).toBeVisible()
    await expect(page.locator('select[name="distributor"] option').nth(1)).toBeAttached()
    await expectNoError(page)
  })

  test('run with an invalid period → inline error', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    await page.locator('select[name="distributor"]').selectOption({ index: 1 })
    await page.locator('input[name="period_start"]').fill('2020-12-31')
    await page.locator('input[name="period_end"]').fill('2020-01-01')
    await page.getByRole('button', { name: 'Run settlement' }).click()
    await expectInlineError(page, 'valid period')
    await expectNoError(page)
  })

  // Gap: run→approve→pay (draft→paid, GL payout + SettlementCompleted) needs
  // seeded accrued commissions and writes irreversible ledger rows.
  test.fixme('run bundles accrued → approve & pay → status paid', async () => {})

  test('RLS-negative: distributor cannot reach settlements', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/settlements/)
    await page.context().close()
  })
})
