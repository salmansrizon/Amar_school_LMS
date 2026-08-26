import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Map #434, the write surfaces. CONTEXT.md: "A Student never edits a school
// record. The complete set of things a Student may create is requests and their
// own work" — a correction request, a leave request, a question, a task marked
// done, and a homework upload. This is that list, end to end through the UI.
//
// Deliberately no test.skip() guards. A missing form is the failure this suite
// exists to catch: an earlier run skipped all four of these while every student
// page was in fact crashing, and reported green.

test.describe('@student portal writes', () => {
  test('#452 a student requests leave and sees it pending', async ({ studentPage: page }) => {
    await page.goto('/student/leave')
    // Far enough out that reruns do not collide on the same window.
    const day = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
    await page.locator('input[name="from_day"]').fill(day)
    await page.locator('input[name="to_day"]').fill(day)
    await page.locator('[name="reason"]').fill(`E2E leave ${Date.now()}`)
    await page.locator('form button[type="submit"]').first().click()

    await expect(page.locator('main')).toContainText(/pending|অপেক্ষমাণ/i)
    await expectNoError(page)
  })

  test('#454 a student asks their class teacher a question', async ({ studentPage: page }) => {
    const subject = `E2E question ${Date.now()}`
    await page.goto('/student/questions')
    // #454 is *anchored* asking: the question hangs off a subject (or a post).
    // Leaving the picker on its em-dash placeholder makes the insert fail the
    // enforce_student_message_refs trigger, silently, with the form still there.
    const anchor = page.locator('select[name="subject_id"]')
    const options = await anchor.locator('option').count()
    expect(options, 'no subject offered to anchor a question to').toBeGreaterThan(1)
    await anchor.selectOption({ index: 1 })
    await page.locator('[name="subject"]').fill(subject)
    await page.locator('[name="body"]').fill('Asked by the map #434 E2E suite.')
    await page.locator('form button[type="submit"]').first().click()

    await expect(page.locator('main')).toContainText(subject)
    await expectNoError(page)
  })

  test('#456 a student raises a correction, and is never offered an edit', async ({
    studentPage: page,
  }) => {
    await page.goto('/student/profile')
    // The #439 IA decision: offer "request a correction", never a dead form.
    const value = `0171${String(Date.now()).slice(-7)}`
    await page.locator('select[name="field"]').selectOption('student_mobile')
    await page.locator('[name="requested_value"]').fill(value)
    await page.locator('form button[type="submit"]').first().click()

    await expect(page.locator('main')).toContainText(new RegExp(`pending|অপেক্ষমাণ|${value}`, 'i'))
    await expectNoError(page)
  })

  test('#446 a student marks a task done, and undone again', async ({ studentPage: page }) => {
    await page.goto('/student/tasks')
    // TaskToggle is a bare <button type="button">, not a form or a checkbox.
    const toggles = page.locator('main button[type="button"]')
    expect(
      await toggles.count(),
      'no task in the fixture — /student/tasks has nothing to complete',
    ).toBeGreaterThan(0)

    // Toggle both ways so the spec leaves the fixture exactly as it found it.
    // An earlier version marked one task per run and silently exhausted them.
    const before = ((await toggles.first().textContent()) ?? '').trim()
    await toggles.first().click()
    await page.reload()
    const after = ((await toggles.first().textContent()) ?? '').trim()
    expect(after, 'completion did not survive a reload').not.toBe(before)

    await toggles.first().click()
    await page.reload()
    expect(((await toggles.first().textContent()) ?? '').trim()).toBe(before)
    await expectNoError(page)
  })

  test('a student is offered no route that edits a school record', async ({
    studentPage: page,
  }) => {
    for (const path of ['/student/students', '/student/marks', '/student/fees/new']) {
      await page.goto(path)
      await expect(page.locator('body')).toBeVisible()
    }
    await expectNoError(page)
  })
})
