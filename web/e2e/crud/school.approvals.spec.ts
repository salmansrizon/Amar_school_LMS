import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// School approvals inbox (map #329, ticket #336, playwright-crud-plan §3). The
// inbox renders for the owner; a non-owner staff without approver rights can't
// act. The approve/reject decision needs a seeded in-progress workflow instance
// where the caller is the current-stage approver — encoded as a gap.

test.describe('@crud @school approvals', () => {
  test('owner opens the approvals inbox', async ({ ownerPage: page }) => {
    await page.goto('/school/approvals')
    await expect(page.locator('main').first()).toBeVisible()
    await expectNoError(page)
  })

  test('staff can view the inbox (not screen-gated); decide is RPC-gated', async ({ browser }) => {
    // The approvals inbox is viewable by any school member — RLS scopes the rows
    // and the decide RPC (workflow_decide) enforces approver rights, so viewing
    // is intentionally open. The staff *decide-block* is the fixme below.
    const page = await asRole(browser, 'staff')
    await page.goto('/school/approvals')
    await expect(page).toHaveURL(/\/school\/approvals/)
    await page.context().close()
  })

  // Gap: approve/reject an in-progress instance (leaves the list) + the staff
  // non-approver RPC error both need a seeded workflow_instance with the owner as
  // the current-stage approver.
  test.fixme('owner approves an in-progress instance → it leaves the list', async () => {})
})
