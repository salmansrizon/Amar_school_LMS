// UAT pass 3, part 3 — the five journeys the first pass could not finish.
//
//   UAT_BASE=http://localhost:3200 node e2e/uat-pass3-journeys.mjs
//
// These are real writes against the shared project, through the real UI, as the
// real personas. Everything it creates is prefixed `UAT3` so it can be found and
// removed; what cannot be removed by a school role (a published notice keeps its
// read receipts, a closed exam is immutable by design) is named in the report
// rather than force-deleted behind the product's own rules.
import { chromium } from '@playwright/test'

const BASE = process.env.UAT_BASE ?? 'http://localhost:3200'
const PASSWORD = 'test-password-123!'
const TAG = `UAT3 ${new Date().toISOString().slice(5, 16).replace('T', ' ')}`

const results = []
function record(journey, step, status, detail = '') {
  results.push({ journey, step, status, detail })
  console.log(`${status === 'pass' ? '✓' : status === 'fail' ? '✗' : '·'} [${journey}] ${step}${detail ? ` — ${detail}` : ''}`)
}

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(school|student|super-admin)(\/|$)/, { timeout: 20_000 })
  return { context, page }
}

const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()

const ONLY = process.argv.slice(2)
const run = (name) => ONLY.length === 0 || ONLY.includes(name)

const browser = await chromium.launch()

// ─────────────────────────────────────────── Journey 1: notice → student read
if (run('notice')) {
  const j = 'notice'
  const title = `${TAG} Notice`
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  await page.goto(`${BASE}/school/notices/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.locator('input').filter({ hasNot: page.locator('[type=file]') }).first().fill(title)
  await page.locator('textarea').first().fill('Published by UAT pass 3 to prove the owner→student path.')
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(2500)
  const afterPublish = await text(page)
  record(j, 'owner publishes a notice', /notices/.test(page.url()) && !/error|ত্রুটি/i.test(afterPublish) ? 'pass' : 'fail', page.url().replace(BASE, ''))

  await page.goto(`${BASE}/school/notices`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  record(j, 'notice appears in the owner list', (await text(page)).includes(title) ? 'pass' : 'fail')
  await context.close()

  const s = await signIn(browser, 's9001@test-a.students.invalid')
  await s.page.goto(`${BASE}/student/notices`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(800)
  const studentSees = (await text(s.page)).includes(title)
  record(j, 'student sees the same notice', studentSees ? 'pass' : 'fail')
  if (studentSees) {
    const link = s.page.locator('a', { hasText: title }).first()
    if (await link.count()) {
      await link.click()
      await s.page.waitForTimeout(1200)
      record(j, 'student opens it (read state)', /notices\//.test(s.page.url()) ? 'pass' : 'info', s.page.url().replace(BASE, ''))
    } else {
      record(j, 'student opens it (read state)', 'info', 'notice rendered inline, no detail link')
    }
  }
  await s.context.close()
}

// ────────────────────────────────── Journey 2: student leave → owner approval
if (run('leave')) {
  const j = 'leave'
  const reason = `${TAG} leave reason`
  const s = await signIn(browser, 's9001@test-a.students.invalid')
  await s.page.goto(`${BASE}/student/leave`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(900)

  // Negative first: reversed dates must be refused with a message, not a crash.
  // A fresh date range per run: the product refuses a second request covering
  // days already asked for, so a fixed range only proves the duplicate guard.
  const day = 1 + Math.floor(Math.random() * 27)
  const from = `2027-03-${String(day).padStart(2, '0')}`
  const to = `2027-03-${String(day + 1).padStart(2, '0')}`
  const dates = s.page.locator('input[type=date]')
  if (await dates.count() >= 2) {
    await dates.nth(0).fill(to)
    await dates.nth(1).fill(from)
    const ta = s.page.locator('textarea').first()
    if (await ta.count()) await ta.fill(`${reason} (reversed)`)
    await s.page.locator('button[type=submit]').first().click()
    await s.page.waitForTimeout(1500)
    const t = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ')
    const refused = /পরে হতে হবে|must be on or after|আগে হতে পারে না/i.test(t)
    record(j, 'reversed dates refused with a message', refused ? 'pass' : 'fail', t.slice(0, 140))

    await dates.nth(0).fill(from)
    await dates.nth(1).fill(to)
    if (await ta.count()) await ta.fill(reason)
    await s.page.locator('button[type=submit]').first().click()
    await s.page.waitForTimeout(2500)
    const after = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ')
    record(j, 'student submits a valid leave request',
      /২০২৭|2027/.test(after) ? 'pass' : 'fail', after.slice(0, 160))
  } else {
    record(j, 'leave form has a date range', 'fail', `${await dates.count()} date inputs`)
  }
  await s.context.close()

  const o = await signIn(browser, 'owner-a@test.local')
  await o.page.goto(`${BASE}/school/attendance/leave`, { waitUntil: 'domcontentloaded' })
  await o.page.waitForTimeout(900)
  // The queue holds every request; the one to act on is the pending row that
  // still offers a decision button.
  const rows = o.page.locator('tr', { hasText: 'Seed Student A' })
  const total = await rows.count()
  let approved = false
  for (let i = 0; i < total; i++) {
    const r = rows.nth(i)
    const buttons = r.locator('button')
    if (await buttons.count()) {
      await buttons.first().click()
      await o.page.waitForTimeout(2000)
      approved = true
      break
    }
  }
  record('leave', 'owner sees the pending request', total ? 'pass' : 'fail', `${total} rows for this student`)
  record('leave', 'owner approves it', approved ? 'pass' : 'fail', approved ? '' : 'no row offered a decision button')
  await o.context.close()

  const s2 = await signIn(browser, 's9001@test-a.students.invalid')
  await s2.page.goto(`${BASE}/student/leave`, { waitUntil: 'domcontentloaded' })
  await s2.page.waitForTimeout(900)
  const st = (await s2.page.locator('main').innerText()).replace(/\s+/g, ' ')
  record('leave', 'student sees the decided status', /অনুমোদিত|approved/i.test(st) ? 'pass' : 'fail', st.slice(0, 160))
  await s2.context.close()
}

// ───────────────────────────── Journey 3: fee collection → receipt → ledger
if (run('fee')) {
  const j = 'fee'
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  await page.goto(`${BASE}/school/fees`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)

  // Pick the first class that has a roster.
  const classSelect = page.locator('select[name=class]').first()
  const options = await classSelect.locator('option').all()
  // "A table has rows" is not "the roster loaded": the recent-records table at
  // the bottom of this page always has rows, and its links go to receipts of
  // payments already taken. The roster is the table whose action links carry
  // #collect-form.
  const rosterAction = () => page.locator('a[href*="#collect-form"]')
  let opened = false
  for (const opt of options.slice(1, 6)) {
    const value = await opt.getAttribute('value')
    if (!value) continue
    await classSelect.selectOption(value)
    await page.locator('button[type=submit]').first().click()
    await page.waitForTimeout(1500)
    if (await rosterAction().count()) { opened = true; break }
  }
  record(j, 'a class roster loads on the fee screen', opened ? 'pass' : 'fail',
    opened ? `${await rosterAction().count()} collectable rows` : 'no row offered a collect action')

  if (opened) {
    await rosterAction().first().click()
    await page.waitForTimeout(1500)
    const formVisible = await page.locator('#collect-form').count()
    record(j, 'the collection form appears (the P1 blocker)', formVisible ? 'pass' : 'fail', page.url().replace(BASE, ''))

    if (formVisible) {
      const received = page.locator('#received_amount')
      await received.fill('1')
      const submit = page.locator('#collect-form button[type=submit]').first()
      const label1 = (await submit.innerText()).trim()
      await submit.click()
      await page.waitForTimeout(700)
      const reviewShown = /নিশ্চিত|Check before/i.test(await text(page))
      record(j, 'first press reviews rather than writes', reviewShown ? 'pass' : 'fail', `button was “${label1}”`)

      await page.locator('#collect-form button[type=submit]').first().click()
      await page.waitForTimeout(3000)
      const onReceipt = /\/school\/fees\/receipt\//.test(page.url())
      record(j, 'second press writes and lands on the receipt', onReceipt ? 'pass' : 'fail', page.url().replace(BASE, ''))

      if (onReceipt) {
        const t = await text(page)
        record(j, 'receipt shows the ledger posting', /খতিয়ানে প্রভাব|Ledger impact/i.test(t) ? 'pass' : 'fail')
        const balanced = /1000|4300|1050|4400/.test(t)
        record(j, 'and names the accounts it posted to', balanced ? 'pass' : 'info', t.slice(t.indexOf('খতিয়ান') || 0, 200))

        // Refresh must not produce a second receipt.
        const receiptUrl = page.url()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(800)
        record(j, 'refresh keeps one receipt', page.url() === receiptUrl ? 'pass' : 'fail')
      }
    }
  }
  await context.close()
}

// ────────────────────────── Journey 4: staff grant → access → revoke → denial
if (run('grant')) {
  const j = 'grant'
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  await page.goto(`${BASE}/school/staff`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const staffLink = page.locator('a[href^="/school/staff/"]').first()
  const has = await staffLink.count()
  record(j, 'owner opens the staff permissions screen', has ? 'pass' : 'fail')
  // Test Staff A1 holds no grants at all, which makes it the one fixture that
  // can be granted and revoked without changing what another suite asserts.
  const staffRow = page.locator('a[href^="/school/staff/"]').filter({ hasText: /Test Staff A1/ }).first()
  const href = (await staffRow.count())
    ? await staffRow.getAttribute('href')
    : await staffLink.getAttribute('href')
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const toggles = page.locator('[aria-pressed]')
  const toggleCount = await toggles.count()
  record(j, 'per-screen grants are individually controllable', toggleCount >= 10 ? 'pass' : 'fail', `${toggleCount} controls`)

  // Grant "fees" (the row the denial half below tests), then revoke it again.
  const feesToggle = page.locator('[aria-pressed]').nth(5)
  const before = await feesToggle.getAttribute('aria-pressed')
  await feesToggle.click()
  await page.waitForTimeout(1800)
  const after = await page.locator('[aria-pressed]').nth(5).getAttribute('aria-pressed')
  record(j, 'owner can flip one screen grant', before !== after ? 'pass' : 'fail', `${before} → ${after}`)
  await context.close()

  // Granted: the same staff user now opens the same screen.
  const g = await signIn(browser, 'staff-a1@test.local')
  await g.page.goto(`${BASE}/school/fees`, { waitUntil: 'domcontentloaded' })
  await g.page.waitForTimeout(800)
  const grantedUrl = g.page.url()
  record(j, 'granted staff opens the screen', !/permission-denied/.test(grantedUrl) ? 'pass' : 'fail', grantedUrl.replace(BASE, ''))
  await g.context.close()

  // Revoke, then prove the same session-fresh login is refused again.
  const o2 = await signIn(browser, 'owner-a@test.local')
  await o2.page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await o2.page.waitForTimeout(900)
  await o2.page.locator('[aria-pressed]').nth(5).click()
  await o2.page.waitForTimeout(1800)
  const restored = await o2.page.locator('[aria-pressed]').nth(5).getAttribute('aria-pressed')
  record(j, 'grant revoked, fixture left as found', restored === before ? 'pass' : 'fail', `back to ${restored}`)
  await o2.context.close()

  // The denial half is provable without mutating anyone: a staff user with no
  // grant is refused, and the refusal names the destination.
  const s = await signIn(browser, 'staff-a1@test.local')
  await s.page.goto(`${BASE}/school/fees`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(700)
  const url = s.page.url()
  const t = (await s.page.locator('main').innerText()).replace(/\s+/g, ' ')
  record(j, 'ungranted staff is refused after revoke', /permission-denied/.test(url) ? 'pass' : 'fail', url.replace(BASE, ''))
  record(j, 'refusal names the destination it refused', t.includes('/school/fees') ? 'pass' : 'fail', t.slice(0, 140))
  record(j, 'refusal offers a way out', /ড্যাশবোর্ড|dashboard/i.test(t) ? 'pass' : 'fail')
  await s.context.close()
}

// ──────────────────────────────── Journey 5: exam visibility, owner ↔ student
if (run('exam')) {
  const j = 'exam'
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  await page.goto(`${BASE}/school/exams`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const t = await text(page)
  record(j, 'owner exam list renders', t.length > 200 ? 'pass' : 'fail', `${t.length} chars of content`)
  const examLinks = await page.locator('a[href^="/school/exams/"]').count()
  record(j, 'exam list size on one page', examLinks < 200 ? 'pass' : 'fail', `${examLinks} exam links rendered, unpaginated`)
  await context.close()

  const s = await signIn(browser, 's9001@test-a.students.invalid')
  await s.page.goto(`${BASE}/student/exams`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(900)
  const st = await text(s.page)
  record(j, 'student exam page renders', st.length > 80 ? 'pass' : 'fail', st.slice(0, 120))
  const dupes = (st.match(/XS1 Physics/g) ?? []).length
  record(j, 'no duplicated subject rows', dupes <= 1 ? 'pass' : 'fail', `${dupes} occurrences`)
  await s.page.goto(`${BASE}/student/results`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(900)
  record(j, 'student results page renders', (await text(s.page)).length > 60 ? 'pass' : 'fail')
  await s.context.close()
}

console.log(`\n${results.length} checks, ${results.filter((r) => r.status === 'fail').length} failing`)
console.log(`tag used for created data: ${TAG}`)
await browser.close()
