import { test } from '@playwright/test'
import { login } from './helpers'
import { mkdirSync } from 'node:fs'

// UX audit capture (not a assertion suite): screenshots per role for scoring.
const DIR = 'e2e/ux-shots'
mkdirSync(DIR, { recursive: true })

const shot = async (page: import('@playwright/test').Page, name: string) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true })
}

test('capture school owner (desktop + mobile)', async ({ page }) => {
  await login(page, 'owner-a@test.local', /\/school(\/|$)/)
  await shot(page, 'owner-01-dashboard')
  for (const [route, name] of [
    ['/school/students', 'owner-02-students'],
    ['/school/students/new', 'owner-03-student-new'],
    ['/school/attendance', 'owner-04-attendance'],
    ['/school/fees', 'owner-05-fees'],
    ['/school/exams', 'owner-06-exams'],
    ['/school/sms', 'owner-07-sms'],
  ] as const) {
    await page.goto(route)
    await shot(page, name)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/school')
  await shot(page, 'owner-08-dashboard-mobile')
  await page.goto('/school/students')
  await shot(page, 'owner-09-students-mobile')
})

test('capture staff (gated school)', async ({ page }) => {
  await login(page, 'staff-e2e@test.local', /\/school(\/|$)/)
  await shot(page, 'staff-01-dashboard')
})

test('capture super admin', async ({ page }) => {
  await login(page, 'super@test.local', /\/super-admin(\/|$)/)
  await shot(page, 'super-01-dashboard')
  for (const [route, name] of [
    ['/super-admin/schools', 'super-02-schools'],
    ['/super-admin/partners', 'super-03-partners'],
    ['/super-admin/sms', 'super-04-sms'],
    ['/super-admin/locations', 'super-05-locations'],
  ] as const) {
    await page.goto(route)
    await shot(page, name)
  }
})

test('capture dealer + gov landings', async ({ page }) => {
  await login(page, 'dealer-e2e@test.local', /\/dealer(\/|$)/)
  await shot(page, 'dealer-01-landing')
  await page.goto('/login')
  await login(page, 'gov-e2e@test.local', /\/gov(\/|$)/)
  await shot(page, 'gov-01-landing')
})
