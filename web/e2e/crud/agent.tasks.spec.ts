import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Agent tasks (map #329, ticket #333, playwright-crud-plan §3). List + detail,
// mark done / reopen, assignee-only RLS. Runs against the seeded 'E2E Agent Task'
// assigned to agent-e2e; the test restores it to open.

test.describe('@crud @agent tasks', () => {
  test('list → detail → mark done → reopen', async ({ agentPage: page }) => {
    await page.goto('/agent/tasks')
    const link = page.getByRole('link', { name: /E2E Agent Task/ })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/agent\/tasks\/[0-9a-f-]+$/)

    // Mark done → button flips to Reopen; then reopen (restore).
    const toggle = page.getByRole('button', { name: /Mark done|Reopen task/ })
    if ((await toggle.innerText()).includes('Mark done')) {
      await toggle.click()
      await expect(page.getByRole('button', { name: 'Reopen task' })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Reopen task' }).click()
    await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible()
    await expectNoError(page)
  })

  test('RLS-negative: distributor cannot reach agent tasks', async ({ browser }) => {
    const page = await asRole(browser, 'distributor')
    await page.goto('/agent/tasks')
    await expect(page).not.toHaveURL(/\/agent\/tasks/)
    await page.context().close()
  })
})
