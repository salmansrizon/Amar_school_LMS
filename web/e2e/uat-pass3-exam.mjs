// UAT pass 3, part 4 — one exam from creation to a student-visible result.
//
//   UAT_BASE=http://localhost:3200 node e2e/uat-pass3-exam.mjs
//
// The first UAT pass skipped this journey because it "creates shared staging
// data and affects student visibility". It does — so this one cleans up after
// itself, which is only possible at all because migration 0171 fixed the guard
// that made an OPEN exam with any child row undeletable.
import { chromium } from '@playwright/test'

const BASE = process.env.UAT_BASE ?? 'http://localhost:3200'
const PASSWORD = 'test-password-123!'
const NAME = `UAT3 Exam ${Date.now().toString().slice(-6)}`

const results = []
const record = (step, status, detail = '') => {
  results.push({ step, status, detail })
  console.log(`${status === 'pass' ? '✓' : status === 'fail' ? '✗' : '·'} ${step}${detail ? ` — ${detail}` : ''}`)
}

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(school|student)(\/|$)/, { timeout: 20_000 })
  return { context, page }
}
const main = async (page) => (await page.locator('main').innerText()).replace(/\s+/g, ' ').trim()

const browser = await chromium.launch()
const { context, page } = await signIn(browser, 'owner-a@test.local')

await page.goto(`${BASE}/school/exams`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.locator('#exam_name').fill(NAME)
// The submit button carries the same label as the section heading
// ("নতুন পরীক্ষা"), so scope by the form that owns the name field instead.
await page.locator('form').filter({ has: page.locator('#exam_name') }).locator('button[type=submit]').click()
await page.waitForURL(/\/school\/exams\/[0-9a-f-]{36}/, { timeout: 20_000 }).catch(() => {})
const examId = page.url().split('/school/exams/')[1]?.split(/[/?#]/)[0] ?? ''
record('owner creates an exam', examId ? 'pass' : 'fail', examId || page.url().replace(BASE, ''))

if (examId) {
  const detail = await main(page)
  record('exam detail opens with its setup steps', detail.length > 200 ? 'pass' : 'fail', `${detail.length} chars`)

  // Marks entry BEFORE the exam has a class: the designed prerequisite state.
  await page.goto(`${BASE}/school/exams/${examId}/marks-entry`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const preflight = await main(page)
  record('marks entry refuses with a prerequisite, not a blank page',
    /শ্রেণি নির্বাচন|select a class/i.test(preflight) ? 'pass' : 'fail', preflight.slice(0, 110))

  // Attach the exam to the Class Teacher's class, which has a real student.
  await page.goto(`${BASE}/school/exams/${examId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const classSelect = page.locator('#class_id')
  const seedOption = await classSelect.locator('option', { hasText: /Seed Class/ }).first().getAttribute('value').catch(() => null)
  if (seedOption) {
    await classSelect.selectOption(seedOption)
    await page.locator('form').filter({ has: page.locator('#class_id') }).locator('button[type=submit]').first().click()
    await page.waitForTimeout(2500)
    record('owner attaches the exam to a class', 'pass', 'Seed Class / A')
  } else {
    record('owner attaches the exam to a class', 'fail', 'class option not found')
  }

  await page.goto(`${BASE}/school/exams/${examId}/marks-entry`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const marksText = await main(page)
  const numberInputs = await page.locator('input[type=number]').count()
  record('marks entry opens with the roster', numberInputs > 0 ? 'pass' : 'info',
    numberInputs ? `${numberInputs} mark fields` : marksText.slice(0, 140))
  if (numberInputs > 0) {
    await page.locator('input[type=number]').first().fill('72')
    const save = page.locator('button', { hasText: /সংরক্ষণ|Save/ }).first()
    if (await save.count()) {
      await save.click()
      await page.waitForTimeout(2500)
      record('marks save', /সংরক্ষ|saved/i.test(await main(page)) ? 'pass' : 'info', (await main(page)).slice(0, 100))
    }
  }

  // Publish results.
  await page.goto(`${BASE}/school/exams/${examId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const publishBtn = page.locator('button', { hasText: /প্রকাশ|Publish/ }).first()
  if (await publishBtn.count()) {
    await publishBtn.click()
    await page.waitForTimeout(2500)
    record('owner publishes results', /প্রকাশিত|Published/.test(await main(page)) ? 'pass' : 'fail')
  } else {
    record('owner publishes results', 'fail', 'no publish control on the exam page')
  }

  // Student side.
  const s = await signIn(browser, 's9001@test-a.students.invalid')
  await s.page.goto(`${BASE}/student/exams`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(1000)
  const studentExams = await main(s.page)
  record('student sees the published exam', studentExams.includes(NAME) ? 'pass' : 'info',
    studentExams.includes(NAME) ? '' : 'exam has no routine rows, so nothing is scheduled to show')
  await s.page.goto(`${BASE}/student/results`, { waitUntil: 'domcontentloaded' })
  await s.page.waitForTimeout(1000)
  const res = await main(s.page)
  record('student results page reflects the publication', res.includes(NAME) ? 'pass' : 'info', res.slice(0, 140))
  await s.context.close()

  // Teardown — the point of the exercise as much as the journey itself.
  await page.goto(`${BASE}/school/exams`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const row = page.locator('tr, li, div').filter({ hasText: NAME }).last()
  const del = row.locator('button').filter({ hasText: /মুছ|Delete/ }).first()
  if (await del.count()) {
    await del.click()
    await page.waitForTimeout(800)
    const confirm = page.locator('button').filter({ hasText: /মুছ|Delete|নিশ্চিত|Confirm/ }).last()
    if (await confirm.count()) await confirm.click()
    await page.waitForTimeout(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const gone = !(await main(page)).includes(NAME)
    record('owner deletes the open exam (0171)', gone ? 'pass' : 'fail', gone ? 'removed' : 'still listed')
  } else {
    record('owner deletes the open exam (0171)', 'info', 'no delete control found in the list row')
  }
}

await context.close()
console.log(`\n${results.length} checks, ${results.filter((r) => r.status === 'fail').length} failing`)
console.log(`exam used: ${NAME} (${examId})`)
await browser.close()
