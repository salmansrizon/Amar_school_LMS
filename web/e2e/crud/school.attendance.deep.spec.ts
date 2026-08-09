import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { ownerClient, createStudent } from './factories'

// Deep CRUD for the Attendance module (map #329, ticket #362). Attendance is
// mark (create) + correct (update) + persisted read — no separate delete. A
// factory student with a unique class/section isolates the roster; the mark
// page filters by ?class&section&date query params.

const SAVE = 'হাজিরা সংরক্ষণ করুন' // attendance.saveAttendance
const SAVED = 'হাজিরা সংরক্ষিত হয়েছে' // attendance.saved

test.describe('@crud @school attendance-deep', () => {
  test('mark → correct → persists on reload', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const className = `E2E AttCls ${Date.now()}`
    const section = 'A'
    const student = await createStudent(owner, { className, section })
    const today = new Date().toISOString().slice(0, 10)
    const url = `/school/attendance/mark?class=${encodeURIComponent(className)}&section=${section}&date=${today}`

    const row = () => page.locator('tr', { hasText: student.name })
    const radios = () => row().locator('input[type="radio"]') // [present, absent]

    await page.goto(url)
    await expect(row()).toBeVisible()

    // Mark absent (2nd radio) → save.
    await radios().nth(1).check()
    await page.getByRole('button', { name: SAVE }).click()
    await expect(page.getByText(SAVED)).toBeVisible()

    // Read: reload → absent persisted.
    await page.goto(url)
    await expect(radios().nth(1)).toBeChecked()

    // Correct: mark present → save → persists.
    await radios().nth(0).check()
    await page.getByRole('button', { name: SAVE }).click()
    await expect(page.getByText(SAVED)).toBeVisible()
    await page.goto(url)
    await expect(radios().nth(0)).toBeChecked()
    await expectNoError(page)

    await student.cleanup()
  })
})
