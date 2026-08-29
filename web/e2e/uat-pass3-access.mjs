// UAT pass 3, part 2 — the access matrix, the phone viewport, language, headers.
//
//   UAT_BASE=http://localhost:3200 node e2e/uat-pass3-access.mjs
//
// Reads nothing from the database: every expected number is written here as a
// literal, taken from a direct SQL count at the time of the run and quoted in
// the report. A test that asks the same query the page asks proves only that
// two identical queries agree.
import { chromium } from '@playwright/test'

const BASE = process.env.UAT_BASE ?? 'http://localhost:3200'
const PASSWORD = 'test-password-123!'

// Facts, counted in SQL on 2026-08-29 against school 3d5b6aaf (owner-a):
const OWNER_STUDENTS = 22          // active students in the school
const CT_STUDENTS = 1              // students of Seed Class/A, teacher-e2e's class
const UNATTACHED_STUDENT = '86ecd367-1979-4fd5-8d1d-995a01a6412f' // not in her class
const CT_CLASS = 'c46c1e74-0cf9-4cb9-a9ae-6b2180be74c4'

const results = []
function record(persona, check, status, detail = '') {
  results.push({ persona, check, status, detail })
  console.log(`${status === 'pass' ? '✓' : status === 'fail' ? '✗' : '·'} [${persona}] ${check}${detail ? ` — ${detail}` : ''}`)
}

async function signIn(browser, email, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(school|student|super-admin|distributor|agent|gov)(\/|$)/, { timeout: 20_000 })
  return { context, page }
}

async function body(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  return {
    url: page.url().replace(BASE, ''),
    text: (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim(),
  }
}

const browser = await chromium.launch()

// ---------------------------------------------------- 1. the ADR 0021 matrix
{
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  const r = await body(page, '/school/students')
  const rows = await page.locator('tbody tr').count()
  record('owner', 'student list shows the whole school', rows === OWNER_STUDENTS ? 'pass' : 'fail',
    `${rows} rows, expected ${OWNER_STUDENTS}`)
  await context.close()
}
{
  // Class Teacher: attachment narrows the Grant. She holds `students`.
  const { context, page } = await signIn(browser, 'teacher-e2e@test.local')
  await page.goto(`${BASE}/school/students`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const rows = await page.locator('tbody tr').count()
  record('classTeacher', 'student list is narrowed to her own class', rows === CT_STUDENTS ? 'pass' : 'fail',
    `${rows} rows, expected ${CT_STUDENTS} (school has ${OWNER_STUDENTS})`)

  const other = await body(page, `/school/students/${UNATTACHED_STUDENT}`)
  const leaked = !/not found|পাওয়া যায়নি|permission|অনুমতি/i.test(other.text) && other.text.length > 200
  record('classTeacher', 'another class’s student by guessed id', leaked ? 'fail' : 'pass',
    leaked ? `rendered ${other.text.slice(0, 80)}` : other.url)

  const cls = await body(page, '/school/classes')
  record('classTeacher', 'classes screen reachable (read) with the grant', /class|শ্রেণি/i.test(cls.text) ? 'pass' : 'fail', cls.url)
  await context.close()
}
{
  // Office staff: grants, no employees row, therefore school-wide.
  const { context, page } = await signIn(browser, 'office-staff@test.local')
  await page.goto(`${BASE}/school/students`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const rows = await page.locator('tbody tr').count()
  record('officeStaff', 'office staff sees the whole school', rows === OWNER_STUDENTS ? 'pass' : 'fail',
    `${rows} rows, expected ${OWNER_STUDENTS}`)
  for (const [path, allowed] of [['/school/fees', true], ['/school/classes', true], ['/school/exams', false], ['/school/sms', false], ['/school/staff', false]]) {
    const r = await body(page, path)
    const denied = /permission-denied/.test(r.url)
    record('officeStaff', `${path} ${allowed ? 'granted' : 'ungranted'}`, denied === !allowed ? 'pass' : 'fail', r.url)
  }
  await context.close()
}
{
  // Subject teacher with no routine slot: an Employee with no attachment.
  const { context, page } = await signIn(browser, 'subject-teacher@test.local')
  await page.goto(`${BASE}/school/students`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const rows = await page.locator('tbody tr').count()
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const explains = /শ্রেণি|class/i.test(text) && rows === 0
  record('subjectTeacher', 'unattached employee sees no students', rows === 0 ? 'pass' : 'fail', `${rows} rows`)
  record('subjectTeacher', 'and the empty list explains why', explains ? 'pass' : 'fail', text.slice(0, 120))
  await context.close()
}
{
  // Cross-tenant: owner-b reaching into owner-a's school by id.
  const { context, page } = await signIn(browser, 'owner-b@test.local')
  const r = await body(page, `/school/students/${UNATTACHED_STUDENT}`)
  const leaked = !/not found|পাওয়া যায়নি/i.test(r.text) && r.text.length > 400
  record('ownerB', 'another tenant’s student by id', leaked ? 'fail' : 'pass', r.url)
  const cls = await body(page, `/school/classes/${CT_CLASS}`)
  const leaked2 = !/not found|পাওয়া যায়নি/i.test(cls.text) && /Seed Class/.test(cls.text)
  record('ownerB', 'another tenant’s class by id', leaked2 ? 'fail' : 'pass', cls.url)
  await context.close()
}
{
  // Student: own records only.
  const { context, page } = await signIn(browser, 's9001@test-a.students.invalid')
  const own = await body(page, '/student/profile')
  record('student', 'own profile renders', /Seed Student A/.test(own.text) ? 'pass' : 'fail', own.url)
  const school = await body(page, `/school/students/${UNATTACHED_STUDENT}`)
  record('student', 'school record by id is refused', school.url.startsWith('/student') ? 'pass' : 'fail', school.url)
  await context.close()
}

// ------------------------------------------------------ 2. phone viewport
{
  const { context, page } = await signIn(browser, 'owner-a@test.local', { width: 390, height: 844 })
  for (const path of ['/school', '/school/students', '/school/attendance/mark', '/school/fees', '/school/exams']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    record('mobile', `${path} horizontal overflow`, overflow <= 2 ? 'pass' : 'fail', `${overflow}px`)
    const small = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('a[href], button')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const label = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)
        if (r.height < 44 && label) out.push(`${label} ${Math.round(r.height)}px`)
      }
      return out
    })
    record('mobile', `${path} targets under 44px`, small.length === 0 ? 'pass' : 'info',
      small.length ? `${small.length}: ${small.slice(0, 4).join(', ')}` : 'none')
  }
  await context.close()
}

// -------------------------------------------------------- 3. language
{
  const { context, page } = await signIn(browser, 'owner-a@test.local')
  await page.goto(`${BASE}/school/students`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  const bn = (await page.locator('body').innerText()).includes('শিক্ষার্থী')
  record('i18n', 'Bangla by default', bn ? 'pass' : 'fail')
  const enBtn = page.locator('button', { hasText: /^EN$/i }).first()
  if (await enBtn.count()) {
    await enBtn.click()
    await page.waitForTimeout(1200)
    const afterSwitch = (await page.locator('body').innerText()).match(/Students|Student list/i) !== null
    record('i18n', 'switch to English changes the page', afterSwitch ? 'pass' : 'fail')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)
    const persisted = (await page.locator('body').innerText()).match(/Students|Student list/i) !== null
    record('i18n', 'choice survives a reload', persisted ? 'pass' : 'fail')
    // Back to Bangla so the fixture account is left as found.
    const bnBtn = page.locator('button', { hasText: /^BN$|বাং/i }).first()
    if (await bnBtn.count()) await bnBtn.click()
  } else {
    record('i18n', 'language switch present', 'fail', 'no EN control found')
  }
  await context.close()
}

// -------------------------------------------------------- 4. headers
{
  const context = await browser.newContext()
  const res = await context.request.get(`${BASE}/login`)
  const h = res.headers()
  const checks = [
    ['Strict-Transport-Security includes subdomains', /includeSubDomains/.test(h['strict-transport-security'] ?? '')],
    ['X-Frame-Options DENY', h['x-frame-options'] === 'DENY'],
    ['frame-ancestors none enforced', /frame-ancestors 'none'/.test(h['content-security-policy'] ?? '')],
    ['full CSP present (report-only by default)', Boolean(h['content-security-policy-report-only'] ?? h['content-security-policy'])],
    ['no x-powered-by', !('x-powered-by' in h)],
    ['nosniff', h['x-content-type-options'] === 'nosniff'],
    ['Referrer-Policy same-origin', h['referrer-policy'] === 'same-origin'],
    ['Reporting-Endpoints set', Boolean(h['reporting-endpoints'])],
  ]
  for (const [name, ok] of checks) record('headers', name, ok ? 'pass' : 'fail')
  await context.close()
}

console.log(`\n${results.length} checks, ${results.filter((r) => r.status === 'fail').length} failing`)
await browser.close()
