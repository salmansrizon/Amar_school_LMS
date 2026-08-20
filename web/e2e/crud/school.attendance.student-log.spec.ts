import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { ownerClient, createStudent } from './factories'
import { classSectionKey } from '@/lib/class-section-options'

// Student Attendance Log (map #380, docs/011_student_module.md): finder ->
// roster -> individual log -> filters -> print. A factory student with a
// unique class/section isolates the roster (same pattern as
// school.attendance.deep.spec.ts). attendance_records can't be seeded by a
// direct insert — RLS only allows writes through the mark-attendance server
// action (school.attendance.deep.spec.ts hits the same constraint) — so this
// test marks the student present through the real Mark Attendance UI first,
// the same way a school admin actually produces the row the log reads.

const VIEW_LOG = 'লগ দেখুন' // attendance.viewLog
const TITLE = 'শিক্ষার্থী উপস্থিতি লগ' // attendance.studentLogTitle
const PRESENT = 'উপস্থিত' // status.present
const BACK = 'ফিরে যান' // common.back
const TODAY_FILTER = 'আজ' // attendance.filterToday
const CUSTOM_FILTER = 'নির্দিষ্ট সময়সীমা' // attendance.filterCustom
const PRINT = 'প্রিন্ট করুন' // print.print
const SAVE = 'হাজিরা সংরক্ষণ করুন' // attendance.saveAttendance
const SAVED = 'হাজিরা সংরক্ষিত হয়েছে' // attendance.saved

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

test.describe('@crud @school attendance-student-log', () => {
  test('finder -> individual log -> Today filter -> print button appears', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const className = `E2E StudentLog ${Date.now()}`
    const section = 'A'
    const student = await createStudent(owner, { className, section })
    const today = todayIso()
    const classSection = encodeURIComponent(classSectionKey(className, section))

    // Mark present through the real UI (present is the radio's default state).
    await page.goto(`/school/attendance/mark?classSection=${classSection}&date=${today}`)
    await expect(page.locator('tr', { hasText: student.name })).toBeVisible()
    await page.getByRole('button', { name: SAVE }).click()
    await expect(page.getByText(SAVED)).toBeVisible()

    // Finder: class/section filter narrows to the one student, roster shows a View Log link.
    await page.goto(`/school/attendance/student-log?classSection=${classSection}`)
    const row = page.locator('tr', { hasText: student.name })
    await expect(row).toBeVisible()
    await row.getByRole('link', { name: VIEW_LOG }).click()

    // Individual log: the day/status table is the innermost <table> on the
    // page — it nests inside PaginatedSheet's own wrapper table, so a bare
    // `tbody tr` matches PaginatedSheet's wrapper row too (it transitively
    // contains this table's thead row as a descendant of *its* tbody).
    // Rows sort newest-first, so today is always the first row.
    await expect(page).toHaveURL(/\/student-log\/[0-9a-f-]{36}/)
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    const dayTable = page.locator('table').last()
    const todayRow = dayTable.locator('tbody tr').first()
    await expect(todayRow).toBeVisible()
    await expect(todayRow.getByText(PRESENT)).toBeVisible()
    await expectNoError(page)

    // Back to the finder: the Class + Section filter must survive the round
    // trip, not silently reset to "All classes" (regression caught in
    // code review — the detail page's back link and the finder's dropdown
    // must agree on the classSection param).
    await page.getByRole('link', { name: BACK }).click()
    await expect(page).toHaveURL(/classSection=/)
    await expect(page.locator('tr', { hasText: student.name })).toBeVisible()
    await page.goBack()

    // Today filter: single-day result, still present.
    await page.getByRole('link', { name: TODAY_FILTER }).click()
    await expect(page).toHaveURL(/view=today/)
    const todayTable = page.locator('table').last()
    await expect(todayTable.locator('tbody tr')).toHaveCount(1)
    await expect(todayTable.locator('tbody tr').getByText(PRESENT)).toBeVisible()

    // Print only shows once there's something to print — true in every mode here.
    await expect(page.getByRole('button', { name: PRINT })).toBeVisible()

    // Custom filter with no range picked yet: no rows, so no print button either.
    await page.getByRole('link', { name: CUSTOM_FILTER }).click()
    await expect(page).toHaveURL(/view=custom/)
    await expect(page.getByRole('button', { name: PRINT })).toHaveCount(0)

    await student.cleanup()
  })
})
