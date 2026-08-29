import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// School PRD modules (map #329, ticket #334, playwright-crud-plan §3). Student
// create+read happy path + regression render-smoke for the stable modules +
// staff-grant negative. (Deeper per-field U/D across all six Bangla modules is
// noted as depth-gap in the analysis.)

test.describe('@crud @school students', () => {
  test('owner creates a student → findable in the list', async ({ ownerPage: page }) => {
    const name = `E2E Student ${Date.now()}`
    await page.goto('/school/students/new')
    await page.locator('input[name="full_name"]').fill(name)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/school\/students(\/|\?|$)/)

    // Search is a `q` query param → look the new student up.
    await page.goto(`/school/students?q=${encodeURIComponent(name)}`)
    await expect(page.getByText(name).first()).toBeVisible()
    await expectNoError(page)
  })

  for (const mod of ['students', 'employees', 'classes', 'attendance', 'exams', 'fees']) {
    test(`owner opens /school/${mod} without error`, async ({ ownerPage: page }) => {
      await page.goto(`/school/${mod}`)
      await expect(page.locator('main, h1').first()).toBeVisible()
      await expectNoError(page)
    })
  }

  test('staff-grant negative: ungranted staff cannot open students', async ({ browser }) => {
    const page = await asRole(browser, 'staff')
    await page.goto('/school/students')
    // Redirected away from the students screen (permission-denied / home).
    await expect(page).not.toHaveURL(/\/school\/students(\/new)?(\?|$)/)
    await page.context().close()
  })
})
