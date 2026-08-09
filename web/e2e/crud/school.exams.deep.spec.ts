import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Deep CRUD for the Exams module (map #329, ticket #363) — the exam entity:
// create (name + year) → read (list) → close (status update, via the confirm
// modal). The UI has no rename/delete on the list; per-subject marks entry is a
// deeper sub-flow (needs class + subjects + enrolled students + grading scheme)
// and is out of this entity-level scope. Closed exams are immutable (no cleanup).

const CLOSE = 'পরীক্ষা বন্ধ করুন' // exams.close
const CONFIRM = 'হ্যাঁ, স্থায়ীভাবে বন্ধ করুন' // exams.closeModalConfirm
const CLOSED = 'বন্ধ' // exams.closed

test.describe('@crud @school exams-deep', () => {
  test('create → read → close (status update)', async ({ ownerPage: page }) => {
    const name = `E2E Exam ${Date.now()}`
    await page.goto('/school/exams')

    await page.locator('#exam_name').fill(name)
    await page.locator('input[name="exam_year"]').fill('2026')
    await page.locator('form:has(#exam_name) button').first().click()

    // Read: the exam row shows name (year in parens).
    const row = page.locator('div.justify-between').filter({ hasText: name })
    await expect(row.first()).toBeVisible()
    await expect(row.first()).toContainText('2026')

    // Close → confirm modal → status becomes Closed. This exam is the only open
    // one (prior runs' exams are already closed), so its close trigger is unique.
    await page.getByRole('button', { name: CLOSE }).click()
    await page.getByRole('button', { name: CONFIRM }).click()
    await expect(
      page.locator('div.justify-between').filter({ hasText: name }).filter({ hasText: CLOSED }),
    ).toBeVisible()
    await expectNoError(page)
  })
})
