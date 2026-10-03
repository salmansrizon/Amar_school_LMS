import { test, expect } from '../fixtures/roles'
import { ownerClient } from './factories'

// The two new EMPLOYEE attendance/leave calendars (map 013 follow-up):
// - attendance/employee's Calendar view (default), whose day cells carry the
//   school's employee attendance rate and, on click/tap, a popover listing
//   every employee's status that day.
// - attendance/off-days's Calendar view (default), whose day cells overlay
//   employee leave onto the existing off_days data and, on click, either the
//   existing AddOffDayForm (pre-filled) or DeleteOffDayButton.
//
// Adding a holiday is the one write in this file — allowed only against the
// seeded fixture school (owner-a@test.local, via ownerClient()) — so the
// target date is picked to land on neither the school's configured Weekly
// Off-Day nor an existing off_days row, and the row is removed again via the
// real UI before the test ends, with a direct-DB fallback in `finally` so a
// failing assertion never leaves it behind (same reasoning as
// crud/factories.ts's cleanupAll).

const VIEW_CALENDAR = 'ক্যালেন্ডার' // attendance.viewCalendar
const DAY_STATUS_TITLE = 'কর্মচারীদের অবস্থা' // attendance.dayStatusTitle
const ADD_TITLE = 'ছুটির দিন যোগ করুন' // attendance.offDayAddTitle
const LABEL_FIELD = 'বিবরণ' // attendance.offDayLabelField
const ADD_SUBMIT = 'যোগ করুন' // common.add
const DELETE = 'মুছুন' // common.delete

/** A date far enough out to avoid today's own on-going month churn, whose
 *  weekday is not the fixture school's configured Weekly Off-Day and which
 *  has no existing off_days row — so the calendar day starts genuinely empty. */
async function findFreeFutureDay(owner: Awaited<ReturnType<typeof ownerClient>>): Promise<string> {
  const { data: school } = await owner.from('schools').select('weekly_off_days').single()
  const offWeekdays = new Set<number>(school?.weekly_off_days ?? [])
  const { data: existing } = await owner
    .from('off_days')
    .select('day')
    .gte('day', isoPlusDays(60))
    .lte('day', isoPlusDays(220))
  const taken = new Set((existing ?? []).map((o) => o.day))

  for (let d = 60; d < 220; d++) {
    const iso = isoPlusDays(d)
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
    if (offWeekdays.has(weekday)) continue
    if (taken.has(iso)) continue
    return iso
  }
  throw new Error('no free calendar day found in the search window')
}

function isoPlusDays(days: number): string {
  const dt = new Date()
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

test.describe('@crud @school attendance-calendars', () => {
  test('Employee Attendance Calendar renders and a day\'s popover lists employees', async ({ ownerPage: page }) => {
    await page.goto('/school/attendance/employee')
    // exact: true — AttendanceTabs' own "Off-Day Calendar" tab is always on
    // this page too, and its label contains "Calendar" as a substring.
    await expect(page.getByRole('link', { name: VIEW_CALENDAR, exact: true })).toBeVisible()
    // Calendar is the default view — the month grid renders without a ?view= param.
    await expect(page.getByRole('grid').first()).toBeVisible()

    // Any day cell carrying a rate (its aria-label has a %) is a real
    // Popover.Trigger — off-day/future cells are plain <div>s with no %.
    const dayWithRate = page.locator('button[aria-label*="%"]').first()
    await expect(dayWithRate).toBeVisible()
    const targetIso = (await dayWithRate.getAttribute('data-iso'))!
    await dayWithRate.click()

    // Trigger and popup both carry the raw date as data-iso (their aria-labels
    // are the spoken, localized date) — `div[...]` so it can't also match the
    // <button> trigger.
    const popover = page.locator(`div[data-iso="${targetIso}"]`)
    await expect(popover.getByText(DAY_STATUS_TITLE)).toBeVisible()
    // At least one employee row under the heading (the fixture school has a
    // seeded roster) — each row is `<name> — <status>`.
    await expect(popover.locator('li').first()).toBeVisible()
  })

  test('Leave Calendar: clicking a free day opens the add-holiday form, and it cleans up', async ({ ownerPage: page }) => {
    const owner = await ownerClient()
    const targetIso = await findFreeFutureDay(owner)
    const [targetYear, targetMonth] = targetIso.split('-')
    const label = `E2E Holiday ${Date.now()}`

    try {
      await page.goto(`/school/attendance/off-days?month=${targetYear}-${targetMonth}`)
      // Calendar is the default view — its month grid is what makes the day
      // button (asserted next) exist at all.
      await expect(page.getByRole('grid').first()).toBeVisible()

      const dayButton = page.locator(`button[data-iso="${targetIso}"]`)
      await expect(dayButton).toBeVisible()
      await dayButton.click()

      // Popup found by its data-iso — `div[...]` so it can't also match the
      // <button> trigger (same data-iso), and scoped so it can't match the
      // page's always-visible top form, which shares this heading's text.
      const popover = page.locator(`div[data-iso="${targetIso}"]`)
      await expect(popover.getByText(ADD_TITLE)).toBeVisible()
      await popover.getByLabel(LABEL_FIELD).fill(label)
      await popover.getByRole('button', { name: ADD_SUBMIT }).click()

      // The List view is the plain server-rendered source of truth — switch to
      // it (same year) to confirm the write landed, independent of whatever
      // the still-open popover happens to be showing.
      await page.goto(`/school/attendance/off-days?view=list&year=${targetYear}`)
      const row = page.locator('li', { hasText: targetIso }).filter({ hasText: label })
      await expect(row).toBeVisible()

      // Clean up through the real UI: the flat list's own Delete button.
      await row.getByRole('button', { name: DELETE }).click()
      await expect(page.locator('li', { hasText: targetIso }).filter({ hasText: label })).toHaveCount(0)
    } finally {
      // Safety net: never leave the fixture school with a stray off-day, even
      // if an assertion above threw before the UI delete ran.
      try {
        await owner.from('off_days').delete().eq('day', targetIso)
      } catch {
        // already removed by the UI step above — not an error
      }
    }
  })
})
