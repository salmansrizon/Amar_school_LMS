import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Distributor lifecycle (map #329, ticket #353, playwright-crud-plan
// §3). /partners/[id]: KYC block + status transitions (approve emits
// DistributorApproved). Runs against the seeded dealer-e2e distributor; the test
// restores status to `pending` afterwards.

const DEALER = '55555555-5555-5555-5555-555555555555'
const PATH = `/super-admin/partners/${DEALER}`

test.describe('@crud @super-admin distributor-lifecycle', () => {
  // Regression: /super-admin/partners/[id] used to crash ("DISTRIBUTOR_STATUSES
  // .filter is not a function") because a client component imported a plain const
  // from a 'use server' module. Fixed by moving the const to ./statuses.ts.
  test('KYC renders; status pending→under_review→approved, then restore', async ({
    superAdminPage: page,
  }) => {
    await page.goto(PATH)
    // KYC block (seeded license/nid).
    await expect(page.getByText('TL-E2E-0001')).toBeVisible()

    // "Current:" label + the status badge are sibling spans → assert on the row.
    const current = () => page.locator('div').filter({ hasText: 'Current:' }).last()
    await expect(current()).toContainText('pending')

    await page.getByRole('button', { name: '→ under_review' }).click()
    await expect(current()).toContainText('under_review')

    await page.getByRole('button', { name: '→ approved' }).click()
    await expect(current()).toContainText('approved')

    // Restore to pending.
    await page.getByRole('button', { name: '→ pending' }).click()
    await expect(current()).toContainText('pending')
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach a partner page', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(new RegExp(`/super-admin/partners/${DEALER}`))
    await page.context().close()
  })
})
