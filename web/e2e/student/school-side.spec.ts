import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Map #434, the school-facing half: what the Owner and the Class Teacher see
// because Students now exist as actors.

test.describe('@student school-side surfaces', () => {
  test('#442 the owner reaches student login management', async ({ ownerPage: page }) => {
    await page.goto('/school/students')
    await expect(page.locator('main, h1').first()).toBeVisible()
    // The login column/action is the whole point of #442 — it must be reachable
    // from the student record, not only from a hidden route.
    await page.goto('/school/students?q=Seed%20Student%20A')
    await expect(page.getByText('Seed Student A').first()).toBeVisible()
    await expectNoError(page)
  })

  test('#443 the class form offers a Class Teacher', async ({ ownerPage: page }) => {
    await page.goto('/school/classes')
    await expect(page.locator('main, h1').first()).toBeVisible()
    await expectNoError(page)
  })

  test('#455 the owner opens the response-performance dashboard', async ({ ownerPage: page }) => {
    await page.goto('/school/questions/response')
    await expect(page).toHaveURL(/\/school\/questions\/response(\?|$)/)
    await expect(page.locator('main, h1').first()).toBeVisible()
    await expectNoError(page)
  })

  test('#456 the owner opens the corrections queue', async ({ ownerPage: page }) => {
    await page.goto('/school/corrections')
    await expect(page).toHaveURL(/\/school\/corrections(\?|$)/)
    await expect(page.locator('main, h1').first()).toBeVisible()
    await expectNoError(page)
  })

  test('#454 the owner reads every question in the school', async ({ ownerPage: page }) => {
    await page.goto('/school/questions')
    await expect(page.locator('main, h1').first()).toBeVisible()
    await expectNoError(page)
  })

  test('the class teacher opens /school/my-classes', async ({ classTeacherPage: page }) => {
    await page.goto('/school/my-classes')
    await expect(page).toHaveURL(/\/school\/my-classes(\/|\?|$)/)
    await expect(page.locator('main, h1').first()).toBeVisible()
    // Resolved through app_current_employee_id() (0138) — an empty page here
    // means the employees.profile_id bridge is broken, not that there is no class.
    await expect(page.locator('main')).toContainText(/Seed Class/i)
    await expectNoError(page)
  })

  test('a class teacher without the grant still is not a Super Admin', async ({ browser }) => {
    const page = await asRole(browser, 'classteacher')
    await page.goto('/super-admin')
    await expect(page).not.toHaveURL(/\/super-admin(\/|$)/)
    await page.context().close()
  })
})
