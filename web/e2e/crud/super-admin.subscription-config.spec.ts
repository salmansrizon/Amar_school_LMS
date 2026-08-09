import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Subscription config (map #329, ticket #348, playwright-crud-plan
// §3). Pricing taka↔poisha round-trip (restored after), create/delete plan,
// plan×feature toggle. Shared-state edits are restored within the test.

const PATH = '/super-admin/subscription-config'

test.describe('@crud @super-admin subscription-config', () => {
  test('pricing round-trips (taka↔poisha), then restores', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    const base = page.locator('input[name="base_fee"]')
    const per = page.locator('input[name="per_student_fee"]')
    const origBase = await base.inputValue()
    const origPer = await per.inputValue()

    await base.fill('2500')
    await per.fill('9')
    await page.getByRole('button', { name: 'Save pricing' }).click()
    await page.reload()
    await expect(page.locator('input[name="base_fee"]')).toHaveValue('2500')
    await expect(page.locator('input[name="per_student_fee"]')).toHaveValue('9')

    // Restore original pricing.
    await page.locator('input[name="base_fee"]').fill(origBase || '2000')
    await page.locator('input[name="per_student_fee"]').fill(origPer || '7')
    await page.getByRole('button', { name: 'Save pricing' }).click()
    await expectNoError(page)
  })

  test('create plan → row + delete; plan×feature toggle', async ({ superAdminPage: page }) => {
    const key = `e2e_plan_${Date.now()}`
    await page.goto(PATH)
    await page.locator('input[name="key"]').first().fill(key)
    await page.locator('input[name="label_en"]').first().fill('E2E Plan')
    await page.getByRole('button', { name: 'Add plan' }).click()

    const row = page.locator('li', { hasText: key })
    await expect(row).toBeVisible()

    // Plan×feature toggle (if any features exist as rows): grant then revert.
    const cell = page.getByRole('button', { name: new RegExp(`on ${key}$`) }).first()
    if (await cell.count()) {
      await cell.click()
      await expect(cell).toHaveAttribute('aria-pressed', 'true')
      await cell.click()
      await expect(cell).toHaveAttribute('aria-pressed', 'false')
    }

    // Delete the plan (no school attached → clean).
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('li', { hasText: key })).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach subscription-config', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/subscription-config/)
    await page.context().close()
  })
})
