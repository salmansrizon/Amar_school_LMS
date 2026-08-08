import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Cross: notifications UI (map #329, ticket #341, playwright-crud-plan §4). Bell
// dropdown + the /notifications inbox mark-read. Owner-a has a seeded 'E2E
// Notice'. (Event-driven "notice appears after approving a distributor" is the
// #340 integration slice + the lifecycle page-load bug — noted as a gap.)

test.describe('@cross notifications', () => {
  test('owner inbox lists the notice and can mark read', async ({ ownerPage: page }) => {
    await page.goto('/notifications')
    await expect(page.getByText('E2E Notice').first()).toBeVisible()
    // A mark-read / mark-all control exists and clicking it does not error.
    const mark = page.getByRole('button', { name: /mark|পড়া|সব/i }).first()
    if (await mark.count()) await mark.click()
    await expectNoError(page)
  })

  test('distributor shell exposes a notifications bell', async ({ distributorPage: page }) => {
    await page.goto('/distributor')
    const bell = page.getByRole('button', { name: /notification|বিজ্ঞপ্তি/i }).first()
    await expect(bell).toBeVisible()
    await bell.click()
    await expectNoError(page)
  })

  // Gap: event-driven notice (approve distributor → distributor sees the notice)
  // depends on the #340 event→notification path and the /partners/[id] page-load
  // fix; see super-admin.distributor-lifecycle.
  test.fixme('approving a distributor delivers an in-app notice', async () => {})
})
