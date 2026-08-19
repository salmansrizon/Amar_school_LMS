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
const OPEN = 'খুলুন' // examDocs.open
const BACK = 'ফিরে যান' // common.back
const EXAM_SETUP_TITLE = 'পরীক্ষা সেটআপ' // examSetup.title

// The one exam in the shared test school configured with both a class and a
// grading scheme, so all six row actions are live including Documents.
const EXAM = 'ZZ Map366 Verify Exam'

// A second exam with a class but *no* grading scheme — the mixed gate state,
// and the control for "is the exam id hardcoded anywhere" (acceptance test K).
const OTHER_EXAM = 'SP2 Exam Six'

const row = (page: Page, name: string) => page.locator('div[id^="exam-"]').filter({ hasText: name }).first()

/** Click a row action and *wait for the soft navigation to land*. Without the
 *  wait, the next click hits the still-mounted list page — whose own chevron
 *  goes to /school — and the test silently measures the wrong journey. */
async function openFromRow(page: Page, name: string, action: string, url: RegExp) {
  await row(page, name).getByRole('link', { name: action }).click()
  await expect(page).toHaveURL(url)
}

/** Click the destination's Back chevron and wait for the list to come back.
 *  The heavier print destinations are still streaming when the chevron first
 *  paints, so wait for the document to settle before clicking and give the
 *  navigation room — otherwise the click lands on nothing and the test looks
 *  like a product failure. */
async function clickBack(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  const back = page.getByRole('link', { name: BACK })
  await back.waitFor({ state: 'visible' })
  await back.click()
  await expect(page).toHaveURL(/\/school\/exams(\?|$)/, { timeout: 20_000 })
}

/** The row's Back-target: the exams list, that row restored. */
async function expectBackOnRow(page: Page, name: string) {
  await expect(page).toHaveURL(/\/school\/exams(\?|$)/)
  // Never an intermediate setup screen (acceptance test H).
  await expect(page).not.toHaveURL(/\/school\/exams\/[0-9a-f-]{36}/)
  await expect(row(page, name)).toBeVisible()
}

test.describe('@crud @school exams back-navigation (map #373)', () => {
  test('A+B: every row offers six actions, in order, for its own exam', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')

    const target = row(page, EXAM)
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
    await page.goto('/school/exams')
    await openFromRow(page, EXAM, GENERATE_SEAT_PLAN, /\/seat-plan\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('F: direct Make Exam Routine → Back lands on the same row', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')
    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('C+D: Documents → Exam Routine closes the popup, and Back lands on the row', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')
    await row(page, EXAM).getByRole('button', { name: DOCUMENTS }).click()

    const dialog = page.getByRole('dialog', { name: DOCUMENTS })
    await expect(dialog).toBeVisible()

    await dialog.locator('li').filter({ hasText: 'রুটিন' }).first().getByRole('link', { name: OPEN }).click()
    await expect(page).toHaveURL(/\/routine\/print\?from=/)
    // C: the popup is gone, not merely hidden behind the new page.
    await expect(dialog).toHaveCount(0)

    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('E: Documents → Seat Plan → Back lands on the row', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')
    await row(page, EXAM).getByRole('button', { name: DOCUMENTS }).click()
    const dialog = page.getByRole('dialog', { name: DOCUMENTS })
    // examDocs.seatPlan — the modal calls it 'আসন বিন্যাস', not the row's 'সিট প্ল্যান তৈরি'.
    await dialog.locator('li').filter({ hasText: 'আসন বিন্যাস' }).first().getByRole('link', { name: OPEN }).click()
    await expect(page).toHaveURL(/\/seat-plan\/print\?from=/)
    await clickBack(page)
    await expectBackOnRow(page, EXAM)
    await page.context().close()
  })

  test('H: Back never exposes Basic Info or a generator screen', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')
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
    const target = row(page, EXAM)
    await expect(target).toBeVisible()

    await openFromRow(page, EXAM, MAKE_ROUTINE, /\/routine\?from=/)
    await clickBack(page)

    await expect(page).toHaveURL(/q=ZZ\+Map366|q=ZZ%20Map366/)
    await expect(page.getByPlaceholder('পরীক্ষার নাম খুঁজুন')).toHaveValue('ZZ Map366')
    await expect(row(page, EXAM)).toBeVisible()
    await page.context().close()
  })

  test('I: the originating row is scrolled back into view, not the top of the list', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    await page.goto('/school/exams')

    // Deliberately NOT the exam the other tests use: that one sorts near the
    // top of the list, where "is the row visible" is trivially true and proves
    // nothing. Take the last row that still has a live Routine action, so the
    // list genuinely has to be scrolled for it to be reachable.
    const withRoutine = page
      .locator('div[id^="exam-"]')
      .filter({ has: page.getByRole('link', { name: MAKE_ROUTINE }) })
    const target = withRoutine.last()
    const anchorId = (await target.getAttribute('id'))!
    const anchor = page.locator(`[id="${anchorId}"]`)

    // Position, not window.scrollY: the shell scrolls an inner container
    // (app-shell.tsx:364 `overflow-y-auto`), so window.scrollY is always 0 and
    // asserting on it proves nothing either way.
    //
    // Precondition — the row is off-screen at rest, so restoring it is a real
    // requirement rather than something that happens to be true.
    await expect(anchor).not.toBeInViewport()

    await target.scrollIntoViewIfNeeded()
    await target.getByRole('link', { name: MAKE_ROUTINE }).click()
    await expect(page).toHaveURL(/\/routine\?from=/)
    await clickBack(page)

    await expect(anchor).toBeInViewport()
    await page.context().close()
  })

  test('preserves other entry points: Seat Plan opened directly still goes to Basic Info', async ({ browser }) => {
    const page = await asRole(browser, 'owner')
    // No `from`: the fallback must be the structural parent, exactly as before
    // map #373 (report §6 — "preserve those legitimate flows").
    await page.goto('/school/exams')
    const href = await row(page, EXAM).getByRole('link', { name: GENERATE_SEAT_PLAN }).getAttribute('href')
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
    await page.goto('/school/exams')

    const second = row(page, OTHER_EXAM)
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
    await page.goto('/school/exams')
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
    await page.goto('/school/exams')

    const target = row(page, EXAM)
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
})
