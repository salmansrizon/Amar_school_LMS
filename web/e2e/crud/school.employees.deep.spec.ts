import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { ownerClient } from './factories'

// Deep per-field CRUD for the Employees module (map #329, ticket #360). Mirrors
// the students shape: create (form) → read (list + detail) → update (inline
// ProfileEditor) → delete (soft archive, confirm-guarded). Bangla labels.

const EDIT = 'প্রোফাইল সম্পাদনা' // employees.editProfile
const SAVE = 'সংরক্ষণ' // behaviour.save
const ARCHIVE = 'আর্কাইভ করুন' // employees.archive
const ARCHIVED_BADGE = 'পুরাতন কর্মচারী' // employees.oldEmployee

test.describe('@crud @school employees-deep', () => {
  test('create → read → update field → archive (delete)', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const name = `E2E DeepEmp ${Date.now()}`
    const updated = `${name} Updated`

    await page.goto('/school/employees/new')
    await page.locator('input[name="full_name"]').fill(name)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/school\/employees(\/|\?|$)/)

    // Read (list) + (detail via id).
    await page.goto(`/school/employees?q=${encodeURIComponent(name)}`)
    await expect(page.getByText(name).first()).toBeVisible()
    const eid = (
      await owner.from('employees').select('id').eq('full_name', name).order('created_at', { ascending: false }).limit(1).single()
    ).data!.id
    await page.goto(`/school/employees/${eid}`)
    await expect(page.getByText(name).first()).toBeVisible()

    // Update a field inline.
    await page.getByRole('button', { name: EDIT }).click()
    await page.locator('input[name="full_name"]').fill(updated)
    await page.getByRole('button', { name: SAVE }).click()
    await expect(page.getByText(updated).first()).toBeVisible()

    // Delete: soft-archive (confirm) → Old Employee badge.
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: ARCHIVE }).click()
    await expect(page.getByText(ARCHIVED_BADGE).first()).toBeVisible()
    await expectNoError(page)

    await owner.from('employees').delete().eq('full_name', updated)
  })
})
