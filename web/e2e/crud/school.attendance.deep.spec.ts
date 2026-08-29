import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { cleanupAll, ownerClient, createClass, createStudent } from './factories'

// Deep CRUD for the Attendance module (map #329, ticket #362). Attendance is
// mark (create) + correct (update) + persisted read — no separate delete. A
// factory student with a unique class/section isolates the roster; the mark
// page filters by ?classSection&date query params — classSection is the
// Class Catalogue row's own id (map #421), so isolation requires createClass()
// alongside createStudent(), not just a unique class/section string.

const SAVE = 'হাজিরা সংরক্ষণ করুন' // attendance.saveAttendance
// #540 replaced the flat "attendance saved" line with a save STATE: the bar
// reads `সংরক্ষিত <time> · সংরক্ষণ করেছেন <who>`, because a register that says
// only "saved" cannot answer the question a parent asks — who marked it.
const SAVED = 'সংরক্ষিত' // attendance.savedAt

test.describe('@crud @school attendance-deep', () => {
  // #541: drains whatever the factories built, pass or fail. The per-object
  // cleanup() call at the end of a test body never runs when the test is the
  // thing that failed, which is how 61 orphaned students accumulated.
  test.afterEach(cleanupAll)

  test('mark → correct → persists on reload', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const className = `E2E AttCls ${Date.now()}`
    const section = 'A'
    const klass = await createClass(owner, { name: className, section })
    const student = await createStudent(owner, { className, section })
    const today = new Date().toISOString().slice(0, 10)
    const url = `/school/attendance/mark?classSection=${encodeURIComponent(klass.id)}&date=${today}`

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
    await klass.cleanup()
  })
})
