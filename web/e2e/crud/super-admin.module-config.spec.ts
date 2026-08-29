import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Super-admin Modules & Features config (map #329, ticket #347,
// playwright-crud-plan §3). Create module + features, set default_state, wire a
// dependency edge, delete. Self-dep + dup-dep are source-guarded and unreachable
// via the UI (the dep <select> filters them out) — covered by unit tests, noted
// in the gap analysis; here we cover the reachable UI paths.

const PATH = '/super-admin/module-config'

test.describe('@crud @super-admin module-config', () => {
  test('create module + feature, set state, dependency edge, delete', async ({
    superAdminPage: page,
  }) => {
    const stamp = Date.now()
    const mod = `e2e_mod_${stamp}`
    const fa = `e2e_feat_a_${stamp}`
    const fb = `e2e_feat_b_${stamp}`
    await page.goto(PATH)

    // Add module.
    await page.locator('input[name="key"]').first().fill(mod)
    await page.locator('input[name="label_en"]').first().fill('E2E Module')
    await page.getByRole('button', { name: 'Add module' }).click()
    const section = page.locator('section', { hasText: mod })
    await expect(section).toBeVisible()

    // Add two features via this module's Add-feature form.
    const addFeature = async (key: string) => {
      await section.locator('input[name="key"]').fill(key)
      await section.getByRole('button', { name: 'Add feature' }).click()
      await expect(section.locator('li', { hasText: key })).toBeVisible()
    }
    await addFeature(fa)
    await addFeature(fb)

    // Set feature A default_state → persists across reload.
    const rowA = section.locator('li', { hasText: fa })
    await rowA.locator('select').first().selectOption('trial')
    await page.reload()
    await expect(
      page.locator('section', { hasText: mod }).locator('li', { hasText: fa }).locator('select').first(),
    ).toHaveValue('trial')

    // Dependency: A depends on B → chip appears, then remove it (wait until the
    // chip is gone so A's row no longer contains B's key).
    const rowA2 = page.locator('section', { hasText: mod }).locator('li', { hasText: fa })
    await rowA2.locator('select').last().selectOption(fb)
    const depChip = rowA2.locator('span', { hasText: fb })
    await expect(depChip.first()).toBeVisible()
    await depChip.getByRole('button', { name: '✕' }).first().click()
    await expect(rowA2.locator('span', { hasText: fb })).toHaveCount(0)

    // Cleanup: delete each feature (assert gone before the next), then the module.
    const delFeature = async (key: string) => {
      const sec = page.locator('section', { hasText: mod })
      await sec.locator('li', { hasText: key }).first().getByRole('button', { name: 'Delete' }).first().click()
      await expect(sec.locator('li', { hasText: key })).toHaveCount(0)
    }
    await delFeature(fa)
    await delFeature(fb)
    await page.locator('section', { hasText: mod }).getByRole('button', { name: 'Delete' }).first().click()
    await expect(page.locator('section', { hasText: mod })).toHaveCount(0)
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach module-config', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto(PATH)
    await expect(page).not.toHaveURL(/\/super-admin\/module-config/)
    await page.context().close()
  })
})
