import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Workflows (map #329, ticket #352, playwright-crud-plan §3).
// Create a definition + stages (auto-seq), activate/deactivate, delete. Inbox is
// read-only. Self-contained.

const PATH = '/super-admin/workflows'

test.describe('@crud @super-admin workflows', () => {
  test('definition + stages CRUD (auto-seq, activate, delete)', async ({ superAdminPage: page }) => {
    const key = `e2e_wf_${Date.now()}`
    await page.goto(PATH)

    // Create definition.
    await page.locator('input[name="key"]').first().fill(key)
    await page.locator('input[name="label_en"]').first().fill('E2E Workflow')
    await page.getByRole('button', { name: 'Add workflow' }).click()

    const card = page
      .locator('div.rounded-lg.border')
      .filter({ hasText: key })
      .filter({ has: page.getByRole('button', { name: 'Add stage' }) })
    await expect(card).toBeVisible()
    await expect(card).toContainText('active')

    // Add two stages → auto-sequenced (stages render as "seq. name · role").
    const addStage = async (nm: string, expectSeq: number) => {
      await card.locator('input[name="name_en"]').fill(nm)
      await card.locator('select[name="approver_role"]').selectOption('super_admin')
      await card.getByRole('button', { name: 'Add stage' }).click()
      await expect(card.locator('ol > li').filter({ hasText: 'super_admin' })).toHaveCount(expectSeq)
    }
    await addStage('Review', 1)
    await addStage('Approve', 2)
    // Auto-seq: first stage is 1., second is 2.
    await expect(card.locator('ol > li').first()).toContainText('1.')
    await expect(card.locator('ol > li').nth(1)).toContainText('2.')

    // Toggle active state.
    await card.getByRole('button', { name: 'Deactivate' }).click()
    await expect(card).toContainText('inactive')

    // Delete the definition (removes it from the list).
    await card.getByRole('button', { name: 'Delete' }).first().click()
    await expect(
      page.locator('div.rounded-lg.border').filter({ hasText: key }).filter({ has: page.getByRole('button', { name: 'Add stage' }) }),
    ).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach workflows', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/workflows/)
    await page.context().close()
  })
})
