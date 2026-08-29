import { test, expect, asRole } from '../fixtures/roles'
import { expectInlineError, expectNoError } from '../helpers'

// Super-admin Notification templates + channel routing (map #329, ticket #346,
// playwright-crud-plan §3). Upsert bn/en template (placeholder chips), route an
// event→channel→template, FK-guarded delete, remove route. Self-contained.

const PATH = '/super-admin/notifications'

/** The template *card* for `key` — scoped by its Delete button so it never
 * collides with the route-form section whose <select> also lists the key. */
function templateCard(page: import('@playwright/test').Page, key: string) {
  return page
    .locator('section')
    .filter({ hasText: key })
    .filter({ has: page.getByRole('button', { name: 'Delete' }) })
}

test.describe('@crud @super-admin notifications', () => {
  test('upsert template → section + placeholder chip; re-upsert updates body', async ({
    superAdminPage: page,
  }) => {
    const key = `e2e_tpl_${Date.now()}`
    await page.goto(PATH)
    await page.locator('input[name="key"]').fill(key)
    await page.locator('input[name="title_en"]').fill('Hello Title')
    await page.locator('textarea[name="body_en"]').fill('Hi {{name}}, welcome {{school}}')
    await page.getByRole('button', { name: 'Save template' }).click()

    const section = templateCard(page, key)
    await expect(section).toContainText('Hi {{name}}')
    // Placeholder chips are exact-text spans (distinct from the body <p>).
    await expect(section.getByText('{{name}}', { exact: true })).toBeVisible()
    await expect(section.getByText('{{school}}', { exact: true })).toBeVisible()

    // Re-upsert same key with new body → updates in place, no dup.
    await page.locator('input[name="key"]').fill(key)
    await page.locator('textarea[name="body_en"]').fill('Updated {{name}}')
    await page.getByRole('button', { name: 'Save template' }).click()
    await expect(templateCard(page, key)).toHaveCount(1)
    await expect(templateCard(page, key)).toContainText('Updated {{name}}')

    // Cleanup.
    await templateCard(page, key).getByRole('button', { name: 'Delete' }).click()
    await expect(templateCard(page, key)).toHaveCount(0)
    await expectNoError(page)
  })

  test('route lifecycle: add → dup error → FK-guarded delete → remove → delete', async ({
    superAdminPage: page,
  }) => {
    const key = `e2e_tpl_${Date.now()}`
    const evt = `E2eEvent${Date.now()}`
    await page.goto(PATH)
    await page.locator('input[name="key"]').fill(key)
    await page.locator('textarea[name="body_en"]').fill('Body {{x}}')
    await page.getByRole('button', { name: 'Save template' }).click()
    await expect(templateCard(page, key)).toBeVisible()

    // Add a route to the new template.
    await page.locator('input[name="event_type"]').fill(evt)
    await page.locator('select[name="channel"]').selectOption('in_app')
    await page.locator('select[name="template_key"]').selectOption(key)
    await page.getByRole('button', { name: 'Add route' }).click()
    await expect(page.getByText(`${evt} · in_app`)).toBeVisible()

    // Duplicate event+channel → inline error.
    await page.locator('input[name="event_type"]').fill(evt)
    await page.locator('select[name="channel"]').selectOption('in_app')
    await page.locator('select[name="template_key"]').selectOption(key)
    await page.getByRole('button', { name: 'Add route' }).click()
    await expectInlineError(page, 'already routed')

    // FK-guarded: deleting a routed template is blocked.
    await templateCard(page, key).getByRole('button', { name: 'Delete' }).click()
    await expectInlineError(page, 'In use by a channel route')

    // Remove the route (✕ inside the chip), then delete succeeds.
    await page.locator('span', { hasText: `${evt} · in_app` }).getByRole('button', { name: '✕' }).click()
    await expect(page.getByText(`${evt} · in_app`)).toHaveCount(0)
    await templateCard(page, key).getByRole('button', { name: 'Delete' }).click()
    await expect(templateCard(page, key)).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach notifications', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/notifications/)
    await page.context().close()
  })
})
