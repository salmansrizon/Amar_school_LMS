import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { ownerClient } from './factories'

// Deep per-field CRUD for the Students module (map #329, ticket #359) — the full
// UI path: create (admission), read (detail), update (inline ProfileEditor),
// delete (soft archive). Bangla-default UI → controls located by their bn label.
// Hard-deletes the row via the owner client at the end so reruns stay clean.

const EDIT = 'প্রোফাইল সম্পাদনা' // students.editProfile
const SAVE = 'সংরক্ষণ' // behaviour.save
const ARCHIVE = 'আর্কাইভ করুন' // students.archive
const ARCHIVED_BADGE = 'পুরাতন শিক্ষার্থী' // students.oldStudent

test.describe('@crud @school students-deep', () => {
  test('create → read → update field → archive (delete)', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const name = `E2E DeepStudent ${Date.now()}`
    const updated = `${name} Updated`

    // Create via the admission form.
    await page.goto('/school/students/new')
    await page.locator('input[name="full_name"]').fill(name)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/school\/students(\/|\?|$)/)

    // Read (list): the new student is findable by search.
    await page.goto(`/school/students?q=${encodeURIComponent(name)}`)
    await expect(page.getByText(name).first()).toBeVisible()

    // Read (detail): navigate straight to the row (id via the owner client).
    const sid = (
      await owner.from('students').select('id').eq('full_name', name).order('created_at', { ascending: false }).limit(1).single()
    ).data!.id
    await page.goto(`/school/students/${sid}`)
    await expect(page.getByText(name).first()).toBeVisible()

    // Update: inline edit the name.
    await page.getByRole('button', { name: EDIT }).click()
    await page.locator('input[name="full_name"]').fill(updated)
    await page.getByRole('button', { name: SAVE }).click()
    await expect(page.getByText(updated).first()).toBeVisible()

    // Delete: soft-archive via the in-app ConfirmDialog → "Old Student" badge.
    await page.getByRole('button', { name: ARCHIVE }).click() // opens dialog
    await page.getByRole('dialog').getByRole('button', { name: ARCHIVE }).click() // confirm
    await expect(page.getByText(ARCHIVED_BADGE).first()).toBeVisible()
    await expectNoError(page)

    // Cleanup: hard-delete the row.
    await owner.from('students').delete().eq('full_name', updated)
  })
})
