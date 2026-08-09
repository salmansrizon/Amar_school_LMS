import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Distributor portal suites (map #329, ticket #332, playwright-crud-plan §3):
// CRM (add lead + stage advance, own-only), onboarding (accept agreement),
// invoices (list + detail + print + record payment), wallet. Runs as the seeded
// dealer-e2e distributor.

test.describe('@crud @distributor crm', () => {
  test('add lead → appears; advance stage on detail', async ({ distributorPage: page }) => {
    const school = `E2E Lead ${Date.now()}`
    await page.goto('/distributor/crm')
    await page.locator('input[name="school_name"]').fill(school)
    await page.getByRole('button', { name: 'Add lead' }).click()

    const card = page.getByRole('link', { name: new RegExp(school) })
    await expect(card).toBeVisible()

    // Open detail and advance the stage (new → contacted); persists on reload.
    await card.click()
    await expect(page).toHaveURL(/\/distributor\/crm\/[0-9a-f-]+$/)
    await page.locator('select').first().selectOption('contacted')
    // The stage write is a server action; reload until the DB reflects it
    // (avoids racing the reload against the in-flight update).
    await expect(async () => {
      await page.reload()
      await expect(page.locator('select').first()).toHaveValue('contacted')
    }).toPass({ timeout: 15_000 })
    await expectNoError(page)
  })
})

test.describe('@crud @distributor onboarding', () => {
  test('onboarding renders; agreement can be accepted (idempotent)', async ({
    distributorPage: page,
  }) => {
    await page.goto('/distributor/onboarding')
    await expect(page.getByText('Onboarding')).toBeVisible()
    const accept = page.getByText(/Accept agreement v\d+/)
    if (await accept.count()) {
      await accept.first().click()
    }
    // Either way the distributor ends up accepted for the current version.
    await expect(page.getByText(/You have accepted the current agreement/)).toBeVisible()
    await expectNoError(page)
  })
})

test.describe('@crud @distributor invoices + wallet', () => {
  test('invoice list → detail → print button + record payment', async ({ distributorPage: page }) => {
    await page.goto('/distributor/invoices')
    const row = page.getByRole('link', { name: 'E2E-INV-0001' })
    await expect(row).toBeVisible()
    await row.click()

    await expect(page.getByRole('heading', { name: /Invoice E2E-INV-0001/ })).toBeVisible()
    // Print control exists; nav chrome is print:hidden.
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()

    // Record a payment → a pending payment row is added.
    await page.locator('input[name="amount"]').fill('100')
    await page.getByRole('button', { name: 'Record payment' }).click()
    await expect(page.getByText(/pending/i).first()).toBeVisible()
    await expectNoError(page)
  })

  test('wallet shows balance + activity', async ({ distributorPage: page }) => {
    await page.goto('/distributor/wallet')
    await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    await expect(page.getByText('Current balance')).toBeVisible()
    await expect(page.getByText('৳', { exact: false }).first()).toBeVisible()
    await expectNoError(page)
  })
})

test.describe('@crud @distributor rbac', () => {
  test('RLS-negative: agent cannot reach distributor CRM', async ({ browser }) => {
    const page = await asRole(browser, 'agent')
    await page.goto('/distributor/crm')
    await expect(page).not.toHaveURL(/\/distributor\/crm/)
    await page.context().close()
  })
})
