import { test, expect, asRole } from '../fixtures/roles'
import { expectRowByText, expectNoRowByText, expectInlineError, expectNoError } from '../helpers'

// Super-admin Coupons CRUD (map #329, ticket #331 — coupons surface, per
// playwright-crud-plan §3). Each test is self-contained: it creates its own
// coupon with a per-run unique code and deletes it, so reruns stay parallel-safe
// and the shared DB is left clean.

const PATH = '/super-admin/coupons'

/** Fresh uppercase coupon code — the `discounts.code` unique key. */
function couponCode(): string {
  return `E2E${Date.now()}${Math.floor(Math.random() * 1000)}`
}

/** Fill the Add-coupon form and submit. */
async function addCoupon(
  page: import('@playwright/test').Page,
  code: string,
  type: 'percent' | 'flat',
  value: string,
) {
  await page.locator('input[name="code"]').fill(code)
  await page.locator('select[name="discount_type"]').selectOption(type)
  await page.locator('input[name="value"]').fill(value)
  await page.getByRole('button', { name: 'Add coupon' }).click()
}

/** Delete a coupon by code via its row action (also doubles as the delete test). */
async function deleteCoupon(page: import('@playwright/test').Page, code: string) {
  const row = page.locator('tr', { hasText: code })
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
}

test.describe('@crud @super-admin coupons', () => {
  test('create → row appears (percent), then delete', async ({ superAdminPage: page }) => {
    const code = couponCode()
    await page.goto(PATH)
    await addCoupon(page, code, 'percent', '10')
    await expectRowByText(page, code)
    await expect(page.locator('tr', { hasText: code })).toContainText('10%')
    await deleteCoupon(page, code)
    await expectNoRowByText(page, code)
    await expectNoError(page)
  })

  test('flat coupon renders formatTaka (৳)', async ({ superAdminPage: page }) => {
    const code = couponCode()
    await page.goto(PATH)
    await addCoupon(page, code, 'flat', '50')
    await expect(page.locator('tr', { hasText: code })).toContainText('৳50.00')
    await deleteCoupon(page, code)
    await expectNoError(page)
  })

  test('activate/deactivate toggles status', async ({ superAdminPage: page }) => {
    const code = couponCode()
    await page.goto(PATH)
    await addCoupon(page, code, 'percent', '15')
    const row = page.locator('tr', { hasText: code })
    await expect(row).toContainText('active')
    await row.getByRole('button', { name: 'Deactivate' }).click()
    await expect(row).toContainText('inactive')
    await row.getByRole('button', { name: 'Activate' }).click()
    await expect(row).toContainText('active')
    await deleteCoupon(page, code)
    await expectNoError(page)
  })

  test('duplicate code → inline error', async ({ superAdminPage: page }) => {
    const code = couponCode()
    await page.goto(PATH)
    await addCoupon(page, code, 'percent', '20')
    await expectRowByText(page, code)
    await addCoupon(page, code, 'percent', '20')
    await expectInlineError(page, 'already exists')
    await deleteCoupon(page, code)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach coupons', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/coupons/)
    await page.context().close()
  })
})
