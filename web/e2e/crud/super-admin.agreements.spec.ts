import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Agreements CRUD (map #329, ticket #345, playwright-crud-plan §3).
// Version the distributor legal agreement: publish (version = max+1), see
// acceptances, delete an unaccepted version, and confirm an accepted version is
// locked. v1 is a seeded, accepted fixture on the shared DB → the locked case.

const PATH = '/super-admin/agreements'

/** The "Versions" section (not "Publish a new version" / "Recent acceptances"). */
function versionsSection(page: import('@playwright/test').Page) {
  return page.locator('section', { hasText: 'Versions' }).filter({ has: page.locator('ul') })
}

async function publish(page: import('@playwright/test').Page, body: string) {
  await page.locator('textarea[name="body"]').fill(body)
  await page.getByRole('button', { name: 'Publish new version' }).click()
}

test.describe('@crud @super-admin agreements', () => {
  test('publish → new version is max+1, then delete it (unaccepted)', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    const items = versionsSection(page).locator('li')
    const topText = await items.first().innerText()
    const maxBefore = Number(topText.match(/v(\d+)/)?.[1] ?? '0')

    const body = `AGREEMENT E2E ${Date.now()}`
    await publish(page, body)

    const created = versionsSection(page).locator('li', { hasText: body })
    await expect(created).toContainText(`v${maxBefore + 1}`)

    // Delete (unaccepted → Delete button present) and confirm it's gone.
    await created.getByRole('button', { name: 'Delete' }).click()
    await expect(versionsSection(page).locator('li', { hasText: body })).toHaveCount(0)
    await expectNoError(page)
  })

  test('read: versions + acceptances render, v1 shows accepted', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    await expect(page.getByRole('heading', { name: 'Versions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Recent acceptances' })).toBeVisible()
    // Seeded v1 has an acceptance.
    await expect(versionsSection(page).locator('li', { hasText: 'v1' }).first()).toContainText('accepted')
    await expectNoError(page)
  })

  test('accepted version is locked (no delete)', async ({ superAdminPage: page }) => {
    await page.goto(PATH)
    const locked = versionsSection(page).locator('li', { hasText: 'accepted — locked' }).first()
    await expect(locked).toBeVisible()
    await expect(locked.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach agreements', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/agreements/)
    await page.context().close()
  })
})
