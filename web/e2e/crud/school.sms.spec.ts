import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// School SMS (map #329, ticket #335, playwright-crud-plan §3). Compose surface +
// buy page render for the owner; staff blocked from buying (owner-only). The
// actual send + package purchase (wallet mutation, gateway) are side-effectful
// and encoded as gaps.

test.describe('@crud @school sms', () => {
  test('owner opens compose + buy', async ({ ownerPage: page }) => {
    await page.goto('/school/sms')
    await expect(page.locator('main').first()).toBeVisible()
    await expectNoError(page)

    await page.goto('/school/sms/buy')
    await expect(page).toHaveURL(/\/school\/sms\/buy/)
    await expectNoError(page)
  })

  test('staff blocked from buying SMS (owner-only)', async ({ browser }) => {
    const page = await asRole(browser, 'staff')
    await page.goto('/school/sms/buy')
    await expect(page).not.toHaveURL(/\/school\/sms\/buy/)
    await page.context().close()
  })

  // Gap: compose→send (segment debit) and buy→wallet-credit mutate the SMS
  // wallet + hit the gateway; needs a funded wallet + send assertions.
  test.fixme('compose sends + buy credits the wallet', async () => {})
})
