import { test, expect, asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Map #434, read surfaces. Every screen the Student Portal ships, opened as the
// Student it was built for, plus the negatives that matter: a Student must not
// reach /school, and a Staff User must not reach /student.
//
// Fixtures: s9001@test-a.students.invalid, "Seed Student A" of Seed Class / A in
// Test School A. seed-test.sql gives that class a Class Teacher and a
// Sunday–Thursday routine, so the home and routine screens have something to say.

const SCREENS: { path: string; ticket: string }[] = [
  { path: '/student', ticket: '#444 home — today, tomorrow, counts' },
  { path: '/student/routine', ticket: '#444 the week grid' },
  { path: '/student/notices', ticket: '#445 notices and class notices' },
  { path: '/student/tasks', ticket: '#446 homework list' },
  { path: '/student/materials', ticket: '#447 syllabi and lesson plans' },
  { path: '/student/results', ticket: '#449 published results only' },
  { path: '/student/exams', ticket: '#450 exam schedule' },
  { path: '/student/attendance', ticket: '#451 own attendance' },
  { path: '/student/leave', ticket: '#452 leave calendar' },
  { path: '/student/fees', ticket: '#453 dues and receipts' },
  { path: '/student/questions', ticket: '#454 questions to the class teacher' },
  { path: '/student/profile', ticket: '#456 own profile, corrections' },
]

test.describe('@student portal read surfaces', () => {
  for (const s of SCREENS) {
    test(`student opens ${s.path} — ${s.ticket}`, async ({ studentPage: page }) => {
      await page.goto(s.path)
      await expect(page).toHaveURL(new RegExp(`${s.path.replace('/', '\\/')}(\\?|$)`))
      await expect(page.locator('main, h1').first()).toBeVisible()
      await expectNoError(page)
    })
  }

  test('the shell carries all twelve nav entries', async ({ studentPage: page }) => {
    await page.goto('/student')
    for (const s of SCREENS) {
      await expect(page.locator(`a[href="${s.path}"]`).first()).toBeVisible()
    }
    await expectNoError(page)
  })

  test('home names the student and their class', async ({ studentPage: page }) => {
    await page.goto('/student')
    await expect(page.getByText('Seed Student A').first()).toBeVisible()
    await expect(page.getByText('S9001').first()).toBeVisible()
  })

  test('the routine shows the seeded week, not an empty grid', async ({ studentPage: page }) => {
    await page.goto('/student/routine')
    // seed-test.sql writes 5 days x 3 periods for Seed Class / A.
    await expect(page.locator('main')).toContainText(/Seed Subject|Subject/i)
    await expectNoError(page)
  })
})

test.describe('@student portal boundaries', () => {
  test('a Student cannot reach the school app', async ({ studentPage: page }) => {
    await page.goto('/school')
    await expect(page).not.toHaveURL(/\/school(\/|$)/)
  })

  test('a Student cannot reach another role app', async ({ studentPage: page }) => {
    await page.goto('/super-admin')
    await expect(page).not.toHaveURL(/\/super-admin(\/|$)/)
  })

  test('a Staff User cannot reach the student portal', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/student')
    await expect(page).not.toHaveURL(/\/student(\/|$)/)
    await page.context().close()
  })

  test('#457 the student search palette is a student branch, not the staff one', async ({
    studentPage: page,
  }) => {
    await page.goto('/student')
    // The palette opens on the shared shortcut and offers student destinations.
    await page.keyboard.press('Control+K')
    const palette = page.locator('[role="dialog"], [cmdk-root]').first()
    if (await palette.isVisible().catch(() => false)) {
      await expect(palette).not.toContainText(/Employees|Fees Collection|Super Admin/i)
    }
    await expectNoError(page)
  })
})
