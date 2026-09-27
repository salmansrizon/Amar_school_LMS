import { test, expect, type Page } from '@playwright/test'
import { asRole } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Back-navigation for the Exams module (map #373, docs/010_exam_module.md).
//
// The bug this pins: every destination's Back chevron used to be a hardcoded
// link to its *structural* parent, so returning from a document unwound through
// screens the user never chose to visit — Seat Plan -> Basic Info -> the exam
// list, scrolled back to the top. Acceptance tests A-L in the report.
//
// UI language defaults to Bangla, so the labels below are the bn strings.
const BASIC_INFO = 'মূল তথ্য' // examSetup.basicInfo
const MARKS_ENTRY = 'নম্বর এন্ট্রি' // exams.markEntry
const COCURRICULAR = 'সহ-শিক্ষা' // exams.cocurricular
const GENERATE_SEAT_PLAN = 'সিট প্ল্যান তৈরি' // exams.generateSeatPlan
const MAKE_ROUTINE = 'রুটিন তৈরি' // exams.makeRoutine
const DOCUMENTS = 'পরীক্ষার কাগজপত্র' // examDocs.title
const BACK = 'ফিরে যান' // common.back
const CLOSE = 'বন্ধ করুন' // common.close
// map 013: Routine/Seat Plan are printables (isPrintPath), so their "Open"
// in the Documents popup is a PrintTrigger icon button (aria-label
// "print.print" + the doc's own label), not a Link to a `/…/print` page —
// see exam-documents-modal.tsx.
const PRINT_ROUTINE = 'প্রিন্ট করুন পরীক্ষার রুটিন' // print.print + examDocs.routine
const PRINT_SEAT_PLAN = 'প্রিন্ট করুন আসন বিন্যাস' // print.print + examDocs.seatPlan
const EXAM_SETUP_TITLE = 'পরীক্ষা সেটআপ' // examSetup.title
const ATTENDANCE_SHEET = 'পরীক্ষার হাজিরা শিট' // examAttendanceSheet.title

// The one exam in the shared test school configured with both a class and a
// grading scheme, so all six row actions are live including Documents.
const EXAM = 'ZZ Map366 Verify Exam'

// A second exam with a class but *no* grading scheme — the mixed gate state,
// and the control for "is the exam id hardcoded anywhere" (acceptance test K).
//
// Was 'SP2 Exam Six', which belongs to the seat-plan suite and is deleted by its
// cleanup. That delete used to fail silently — an open exam with child rows was
// undeletable until migration 0171 — so this spec had been leaning on a bug to
// keep its fixture alive. Both exams are seeded now (supabase/seed-test.sql).
const OTHER_EXAM = 'ZZ Map366 Gate Exam'

const MORE = 'আরও অ্যাকশন' // exams.moreActions

// Map 013 A3: the list is a DataTable (a <tr> on desktop, an <li> card on a
// phone, one of them displayed). The visible row shows one next step and a ⋮;
// it carries [data-exam-row] (the Back anchor). The six actions (docs/010 §1)
// open behind ⋮ in a popover dialog named "আরও অ্যাকশন: <exam>".
const rowEl = (page: Page, name: string) =>
  page.locator('tr, li').filter({ hasText: name }).filter({ visible: true }).first().locator('[data-exam-row]').first()

/** Open the row's ⋮ and return its six-action set. */
async function row(page: Page, name: string) {
  const label = `${MORE}: ${name}`
  await rowEl(page, name).getByRole('button', { name: label }).click()
  return page.getByRole('dialog', { name: label }).locator('[data-exam-row]')
}

/** The list, already filtered to one exam by name.
 *
 *  The list shows the newest 25 rows and pages from there (#550) — 570 exams on
 *  one screen was 934 controls under 44px on a phone. So a spec that wants an
 *  exam seeded long ago finds it the way a human does, through the search box,
 *  rather than relying on the whole table being present. `?q=` seeds exactly the
 *  filter the box sets, and the row's own Back origin carries it back.
 *
 *  Tests I and J keep the unfiltered list on purpose: I needs a list long enough
 *  that its target row is genuinely off-screen, and J types into the box itself. */
const openList = (page: Page, name: string = EXAM) =>
  page.goto(`/school/exams?q=${encodeURIComponent(name)}`)

/** Click a row action and *wait for the soft navigation to land*. Without the
 *  wait, the next click hits the still-mounted list page — whose own chevron
 *  goes to /school — and the test silently measures the wrong journey. */
async function openFromRow(page: Page, name: string, action: string, url: RegExp) {
  await (await row(page, name)).getByRole('link', { name: action }).click()
  await expect(page).toHaveURL(url)
}

/** Click the destination's Back chevron and wait for the list to come back.
 *  The heavier print destinations are still streaming when the chevron first
 *  paints, so wait for the document to settle before clicking and give the
 *  navigation room — otherwise the click lands on nothing and the test looks
 *  like a product failure. */
async function clickBack(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  // Opened from a row, the destination is a route popup (map 013): its way
  // back is ✕, and the page's own chevron is hidden in there (test H).
  // Wait for whichever exit renders: the popup may still be mounting.
  const close = page.getByRole('dialog').getByRole('button', { name: CLOSE })
  const back = page.getByRole('link', { name: BACK })
  const exit = close.or(back).first()
  await exit.waitFor({ state: 'visible' })
  await exit.click()
  await expect(page).toHaveURL(/\/school\/exams(\?|$)/, { timeout: 20_000 })
}

/** The row's Back-target: the exams list, that row restored. */
async function expectBackOnRow(page: Page, name: string) {
  await expect(page).toHaveURL(/\/school\/exams(\?|$)/)
  // Never an intermediate setup screen (acceptance test H).
  await expect(page).not.toHaveURL(/\/school\/exams\/[0-9a-f-]{36}/)
  await expect(rowEl(page, name)).toBeVisible()
}

test.describe('@crud @school exams back-navigation (map #373)', () => {
  test('A+B: every row offers six actions, in order, for its own exam', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)

    const target = await row(page, EXAM)
    await expect(target).toBeVisible()

    for (const label of [BASIC_INFO, MARKS_ENTRY, COCURRICULAR, GENERATE_SEAT_PLAN, MAKE_ROUTINE, DOCUMENTS]) {
      await expect(target.getByText(label, { exact: true })).toBeVisible()
    }

    // Order is fixed by the spec, not incidental.
    const labels = await target.locator('a, button').allInnerTexts()
    const actions = labels.map((l) => l.trim()).filter((l) => l.length > 0)
    expect(actions).toEqual([BASIC_INFO, MARKS_ENTRY, COCURRICULAR, GENERATE_SEAT_PLAN, MAKE_ROUTINE, DOCUMENTS])

    // B: the action opens *this* exam, and carries a return origin.
    await target.getByRole('link', { name: GENERATE_SEAT_PLAN }).click()
    await expect(page).toHaveURL(/\/school\/exams\/[0-9a-f-]{36}\/seat-plan\?from=/)
    await expectNoError(page)
    await page.context().close()
  })

  test('G: direct Generate Seat Plan → Back lands on the same row', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await openFromRow(page, EXAM, GENERATE_SEAT_PLAN, /\/seat-plan\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('F: direct Make Exam Routine → Back lands on the same row', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('C+D: Documents → Exam Routine opens the print preview, closes the popup, and the list/row never left', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await (await row(page, EXAM)).getByRole('button', { name: DOCUMENTS }).click()

    const dialog = page.getByRole('dialog', { name: DOCUMENTS })
    await expect(dialog).toBeVisible()

    await dialog.locator('li').filter({ hasText: 'রুটিন' }).first().getByRole('button', { name: PRINT_ROUTINE }).click()
    // D, revised for the print-popup path (map 013): a printable never
    // navigates the page away at all, so there is nothing to unwind — the
    // exam list (and its row) was never left in the first place.
    const preview = page.getByRole('dialog', { name: PRINT_ROUTINE })
    await expect(preview).toBeVisible()
    await expect(page).toHaveURL(/\/school\/exams(\?|$)/)
    // C: the Documents popup is gone, not merely hidden behind the preview.
    await expect(dialog).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('E: Documents → Seat Plan opens the print preview; the list/row never left', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await (await row(page, EXAM)).getByRole('button', { name: DOCUMENTS }).click()
    const dialog = page.getByRole('dialog', { name: DOCUMENTS })
    await dialog.locator('li').filter({ hasText: 'আসন বিন্যাস' }).first().getByRole('button', { name: PRINT_SEAT_PLAN }).click()
    const preview = page.getByRole('dialog', { name: PRINT_SEAT_PLAN })
    await expect(preview).toBeVisible()
    await expect(page).toHaveURL(/\/school\/exams(\?|$)/)
    await expect(dialog).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(preview).toHaveCount(0)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('H: Back never exposes Basic Info or a generator screen', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)

    // One Back is the whole journey — no Exam Setup heading anywhere in it.
    await expect(page.getByRole('heading', { name: new RegExp(EXAM_SETUP_TITLE) })).toHaveCount(0)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('J: filters survive the round trip, with the exam still in context', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')

    await page.getByPlaceholder('পরীক্ষার নাম খুঁজুন').fill('ZZ Map366')
    await page.getByPlaceholder('পরীক্ষার নাম খুঁজুন').press('Enter')
    await expect(rowEl(page, EXAM)).toBeVisible()

    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)

    await expect(page).toHaveURL(/q=ZZ\+Map366|q=ZZ%20Map366/)
    await expect(page.getByPlaceholder('পরীক্ষার নাম খুঁজুন')).toHaveValue('ZZ Map366')
    await expect(rowEl(page, EXAM)).toBeVisible()
    await page.context().close()
  })

  test('I: the originating row is scrolled back into view, not the top of the list', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')

    // Deliberately NOT the exam the other tests use: that one sorts near the
    // top of the list, where "is the row visible" is trivially true and proves
    // nothing. Take the last row that still has a live Routine action, so the
    // list genuinely has to be scrolled for it to be reachable.
    const anchors = page.locator('tr [data-exam-row]').filter({ visible: true })
    let anchorId = ''
    for (let i = (await anchors.count()) - 1; i >= 0 && !anchorId; i--) {
      const a = anchors.nth(i)
      const id = (await a.getAttribute('data-exam-row'))!
      await a.getByRole('button', { name: new RegExp(MORE) }).click()
      const live = await page
        .getByRole('dialog', { name: new RegExp(MORE) })
        .getByRole('link', { name: MAKE_ROUTINE })
        .count()
      await page.keyboard.press('Escape')
      if (live) anchorId = id
    }
    expect(anchorId).not.toBe('')
    // Opening each ⋮ scrolled the list; start from rest again.
    await page.reload()
    const anchor = page.locator(`tr [data-exam-row="${anchorId}"]`).filter({ visible: true })
    const target = anchor

    // Position, not window.scrollY: the shell scrolls an inner container
    // (app-shell.tsx:364 `overflow-y-auto`), so window.scrollY is always 0 and
    // asserting on it proves nothing either way.
    //
    // Precondition — the row is off-screen at rest, so restoring it is a real
    // requirement rather than something that happens to be true.
    await expect(anchor).not.toBeInViewport()

    await target.scrollIntoViewIfNeeded()
    await target.getByRole('button', { name: new RegExp(MORE) }).click()
    await page.getByRole('dialog', { name: new RegExp(MORE) }).getByRole('link', { name: MAKE_ROUTINE }).click()
    await expect(page).toHaveURL(/\/routine\?from=/)
    await clickBack(page)

    await expect(anchor).toBeInViewport()
    await page.context().close()
  })

  test('preserves other entry points: Seat Plan opened directly still goes to Basic Info', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    // No `from`: the fallback must be the structural parent, exactly as before
    // map #373 (report §6 — "preserve those legitimate flows").
    await openList(page)
    const href = await (await row(page, EXAM)).getByRole('link', { name: GENERATE_SEAT_PLAN }).getAttribute('href')
    const examId = href!.match(/exams\/([0-9a-f-]{36})/)![1]

    await page.goto(`/school/exams/${examId}/seat-plan`)
    await page.getByRole('link', { name: BACK }).click()
    await expect(page).toHaveURL(new RegExp(`/school/exams/${examId}$`))
    await page.context().close()
  })

  // A second, differently-configured exam: class set but no grading scheme, so
  // Seat Plan and Routine are live while Marks Entry and Documents are gated.
  // Proves the gate is read per exam and no id is baked in.
  test('K: a second exam behaves the same, with its own gate state', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page, OTHER_EXAM)

    const second = await row(page, OTHER_EXAM)
    await expect(second).toBeVisible()
    // Class-only gate: these two are live...
    await expect(second.getByRole('link', { name: GENERATE_SEAT_PLAN })).toBeVisible()
    await expect(second.getByRole('link', { name: MAKE_ROUTINE })).toBeVisible()
    // ...while the grading-scheme ones are not.
    await expect(second.getByRole('button', { name: MARKS_ENTRY, disabled: true })).toBeVisible()
    await expect(second.getByRole('button', { name: DOCUMENTS, disabled: true })).toBeVisible()

    await openFromRow(page, OTHER_EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, OTHER_EXAM)
    await page.context().close()
  })

  // L: the platform Back control, which follows history rather than ?from=.
  // The two mechanisms are allowed to differ; neither may strand the user on an
  // intermediate screen.
  test('L: browser Back also returns to the list, not an intermediate screen', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await openFromRow(page, EXAM, GENERATE_SEAT_PLAN, /\/seat-plan\?from=/)

    await page.goBack()
    await expectBackOnRow(page, EXAM)

    // And forward again, then the in-app chevron — the two must not fight.
    await page.goForward()
    await expect(page).toHaveURL(/\/seat-plan\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  // Report §7 keeps the existing responsive behaviour. Six pills is where that
  // could plausibly break, so check the row on a phone-sized viewport.
  test('six actions stay usable on a phone viewport, with no horizontal overflow', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.setViewportSize({ width: 390, height: 844 })
    await openList(page)

    const target = await row(page, EXAM)
    await target.scrollIntoViewIfNeeded()
    for (const label of [BASIC_INFO, MARKS_ENTRY, COCURRICULAR, GENERATE_SEAT_PLAN, MAKE_ROUTINE, DOCUMENTS]) {
      await expect(target.getByText(label, { exact: true })).toBeVisible()
    }

    // The row wraps; the page must not scroll sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // Still navigable at this size.
    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  // Secondary hops *inside* a destination used to drop the origin, so Back from
  // one fell through to Basic Info — §3's complaint, one level in. The origin now
  // nests: the sheet returns to the seat plan, and the seat plan to the row.
  test('origin survives a hop inside a destination (seat plan → attendance sheet)', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await openList(page)
    await openFromRow(page, EXAM, GENERATE_SEAT_PLAN, /\/seat-plan\?from=/)

    await page.getByRole('link', { name: ATTENDANCE_SHEET }).first().click()
    await expect(page).toHaveURL(/\/attendance-sheet\?from=/)

    // First Back returns to the seat plan, not Basic Info.
    await page.getByRole('link', { name: BACK }).click()
    await expect(page).toHaveURL(/\/seat-plan(\?|$)/)
    await expect(page).not.toHaveURL(/\/seat-plan\/print/)

    // Second Back reaches the originating row.
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })
})
