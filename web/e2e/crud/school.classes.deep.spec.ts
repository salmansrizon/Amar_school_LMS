import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Deep CRUD for the Classes module (map #329, ticket #361). The classes surface
// has no inline edit, so this covers Create / Read (list) / Delete + the dup-key
// guard — the full reachable per-field path. Bangla-default UI; the class row is
// a table row, delete is confirm-guarded.

test.describe('@crud @school classes-deep', () => {
  test('create → list → duplicate guard → delete', async ({ ownerPage: page }) => {
    const name = `E2E Class ${Date.now()}`
    await page.goto('/school/classes')

    // The add-class form lives in a modal (map 013 A1): open it from the list
    // header unless a failed submit already left it open, then submit via the
    // form's own button.
    const openAdd = async () => {
      if (!(await page.locator('#class_name').isVisible())) {
        await page.getByRole('button', { name: '+ শ্রেণি যোগ করুন' }).click() // classes.addClass
      }
    }
    const submit = () => page.locator('form', { has: page.locator('#class_name') }).getByRole('button').click()

    // Create.
    await openAdd()
    await page.locator('#class_name').fill(name)
    await page.locator('#class_section').fill('A')
    await submit()
    const row = page.locator('tr', { hasText: name })
    await expect(row).toBeVisible()

    // Duplicate name+section → inline error.
    await openAdd()
    await page.locator('#class_name').fill(name)
    await page.locator('#class_section').fill('A')
    await submit()
    await expect(page.getByText(/already exists/i)).toBeVisible()

    // Delete via the in-app ConfirmDialog → row gone.
    await row.getByRole('button').click() // opens dialog
    await page.getByRole('dialog').getByRole('button', { name: 'মুছুন' }).click() // common.delete confirm
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0)
    await expectNoError(page)
  })
})
