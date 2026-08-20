import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'
import { ownerClient, createStudent } from './factories'

// Class + Section dropdown consolidation (map #398, docs/011_student_module.md).
// The doc's own acceptance checklist (§"Finally, verify all four locations")
// is UI-shaped — dropdown loads, combinations are correct and deduped,
// selection filters correctly, switching between combinations works — and
// the pre-existing specs for these pages exercised the four target pages by
// navigating straight to a `?classSection=` URL, never actually driving the
// `<select name="classSection">` itself. This file closes that gap: one
// thorough pass (label format, dedup, select, switch) on Mark Attendance,
// since all four pages share the same `classSectionOptions` primitive, then
// one focused select-and-filter check per remaining page.

const FILTER = 'ফিল্টার' // classes.filter

test.describe('@crud @school class-section-select', () => {
  test('Mark Attendance: dropdown lists deduped "Class - Section" combos, selecting/switching filters the roster', async ({
    ownerPage: page,
  }) => {
    const owner = await ownerClient()
    const className = `E2E CS ${Date.now()}`
    const sectionA = 'Morning - A' // deliberately contains " - " (map #398 decision: composite value must not split on it)
    const sectionB = 'Day - B'
    const labelA = `${className} - ${sectionA}`
    const labelB = `${className} - ${sectionB}`

    const studentA1 = await createStudent(owner, { className, section: sectionA })
    const studentA2 = await createStudent(owner, { className, section: sectionA }) // same combo — must not duplicate the option
    const studentB = await createStudent(owner, { className, section: sectionB })

    await page.goto('/school/attendance/mark')
    const select = page.locator('select[name="classSection"]')
    await expect(select).toBeVisible()

    // Combinations are correct and not duplicated: exactly one option per
    // distinct class+section pair, regardless of how many students share it.
    await expect(select.locator('option', { hasText: labelA })).toHaveCount(1)
    await expect(select.locator('option', { hasText: labelB })).toHaveCount(1)

    // Selection filters to just that combination's students. Asserting the
    // exact encoded value (not just that the param name is present) catches
    // a submit that silently lands on "All classes" instead of the intended
    // combo.
    const optionValueA = await select.locator('option', { hasText: labelA }).getAttribute('value')
    await select.selectOption({ label: labelA })
    await page.getByRole('button', { name: FILTER }).click()
    await expect(page).toHaveURL(/classSection=/)
    expect(new URL(page.url()).searchParams.get('classSection')).toBe(optionValueA)
    await expect(page.locator('tr', { hasText: studentA1.name })).toBeVisible()
    await expect(page.locator('tr', { hasText: studentA2.name })).toBeVisible()
    await expect(page.locator('tr', { hasText: studentB.name })).toHaveCount(0)

    // Switching to a different combination re-filters correctly — the exact
    // regression MarkAttendanceForm's key fix (below) addresses: without a
    // key tied to the filter, the roster's client-side state would keep
    // showing the previous selection after a soft navigation.
    await page.locator('select[name="classSection"]').selectOption({ label: labelB })
    await page.getByRole('button', { name: FILTER }).click()
    await expect(page.locator('tr', { hasText: studentB.name })).toBeVisible()
    await expect(page.locator('tr', { hasText: studentA1.name })).toHaveCount(0)
    await expect(page.locator('tr', { hasText: studentA2.name })).toHaveCount(0)
    await expectNoError(page)

    await studentA1.cleanup()
    await studentA2.cleanup()
    await studentB.cleanup()
  })

  test('Attendance Book: dropdown loads and filters the register grid', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const className = `E2E CSBook ${Date.now()}`
    const sectionA = 'A'
    const sectionB = 'B'
    const labelA = `${className} - ${sectionA}`
    const studentA = await createStudent(owner, { className, section: sectionA })
    const studentB = await createStudent(owner, { className, section: sectionB })

    await page.goto('/school/attendance/book')
    const select = page.locator('select[name="classSection"]')
    await expect(select).toBeVisible()
    await expect(select.locator('option', { hasText: labelA })).toHaveCount(1)

    await select.selectOption({ label: labelA })
    await page.getByRole('button', { name: FILTER }).click()
    await expect(page).toHaveURL(/classSection=/)
    // PaginatedSheet renders the same row twice (a hidden measurement copy for
    // print pagination alongside the visible one, ADR 0007) — .first() targets
    // the one actually on screen.
    await expect(page.locator('tr', { hasText: studentA.name }).first()).toBeVisible()
    await expect(page.locator('tr', { hasText: studentB.name })).toHaveCount(0)
    await expectNoError(page)

    await studentA.cleanup()
    await studentB.cleanup()
  })

  test('Student Log finder: dropdown loads and filters the roster', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const className = `E2E CSLog ${Date.now()}`
    const sectionA = 'A'
    const sectionB = 'B'
    const labelA = `${className} - ${sectionA}`
    const studentA = await createStudent(owner, { className, section: sectionA })
    const studentB = await createStudent(owner, { className, section: sectionB })

    await page.goto('/school/attendance/student-log')
    const select = page.locator('select[name="classSection"]')
    await expect(select).toBeVisible()
    await expect(select.locator('option', { hasText: labelA })).toHaveCount(1)

    await select.selectOption({ label: labelA })
    await page.getByRole('button', { name: FILTER }).click()
    await expect(page).toHaveURL(/classSection=/)
    await expect(page.locator('tr', { hasText: studentA.name })).toBeVisible()
    await expect(page.locator('tr', { hasText: studentB.name })).toHaveCount(0)
    await expectNoError(page)

    await studentA.cleanup()
    await studentB.cleanup()
  })

  test('Students List: dropdown loads and filters the list', async ({ ownerPage: page }) => {
    // Students List renders the combined combo through a Base UI Select
    // (components/ui/select.tsx) rather than a native <select> — a client
    // component with instant filter-on-change, not a Filter-button GET form
    // like the other three pages. Interaction is trigger-click then
    // option-click; the underlying option list still comes from the same
    // classSectionOptions module, so the combos/labels themselves match.
    const owner = await ownerClient()
    const className = `E2E CSStudents ${Date.now()}`
    const sectionA = 'A'
    const sectionB = 'B'
    const labelA = `${className} - ${sectionA}`
    const studentA = await createStudent(owner, { className, section: sectionA })
    const studentB = await createStudent(owner, { className, section: sectionB })

    await page.goto('/school/students')
    const trigger = page.getByRole('combobox', { name: 'শ্রেণি/শাখা' }) // students.classSection
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.getByRole('option', { name: labelA })).toHaveCount(1)

    await page.getByRole('option', { name: labelA }).click()
    await expect(page).toHaveURL(/classSection=/)
    await expect(page.locator('tr', { hasText: studentA.name })).toBeVisible()
    await expect(page.locator('tr', { hasText: studentB.name })).toHaveCount(0)
    await expectNoError(page)

    await studentA.cleanup()
    await studentB.cleanup()
  })

  test('renders in English when the language cookie is set to en', async ({ ownerPage: page }) => {
    // asm-lang (lib/i18n.ts LANG_COOKIE) is what components/lang-switch.tsx
    // writes; setting it directly is equivalent to clicking "EN" and lets
    // this run headless without a UI round trip. Mark Attendance and
    // Students List cover both the attendance.* and students.* label keys.
    await page.goto('/school/attendance/mark')
    // path must be explicit — components/lang-switch.tsx sets path=/ so the
    // cookie applies site-wide; addCookies({ url }) alone defaults the path
    // to that URL's directory (/school/attendance/), which would silently
    // stay unnoticed by the second page.goto below. Playwright rejects
    // combining url with domain/path, so derive domain from the URL instead.
    await page.context().addCookies([{ name: 'asm-lang', value: 'en', domain: new URL(page.url()).hostname, path: '/' }])
    await page.reload()
    await expect(page.getByText('Class/Section', { exact: true })).toBeVisible()
    await expect(page.locator('select[name="classSection"] option', { hasText: 'All Classes' })).toHaveCount(1)

    await page.goto('/school/students')
    await page.getByRole('combobox', { name: 'Class/Section' }).click()
    await expect(page.getByRole('option', { name: 'All Classes' })).toBeVisible()
    await expectNoError(page)
  })
})
