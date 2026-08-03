import { expect, test } from '@playwright/test'
import { expectNoError, login } from './helpers'

// Feature reachability per end: land, then open each core module without error.
test('School Owner can open core modules', async ({ page }) => {
  await login(page, 'owner-a@test.local', /\/school(\/|$)/)
  for (const route of ['/school/students', '/school/attendance', '/school/exams', '/school/fees', '/school/sms']) {
    const resp = await page.goto(route)
    expect(resp?.status(), `${route} status`).toBeLessThan(400)
    await expect(page).toHaveURL(new RegExp(route.replace(/\//g, '\\/')))
    await expectNoError(page)
  }
})

test('Super Admin can open core modules', async ({ page }) => {
  await login(page, 'super@test.local', /\/super-admin(\/|$)/)
  for (const route of ['/super-admin/schools', '/super-admin/partners', '/super-admin/sms', '/super-admin/locations']) {
    const resp = await page.goto(route)
    expect(resp?.status(), `${route} status`).toBeLessThan(400)
    await expect(page).toHaveURL(new RegExp(route.replace(/\//g, '\\/')))
    await expectNoError(page)
  }
})

test('a school member cannot reach the super-admin group', async ({ page }) => {
  await login(page, 'owner-a@test.local', /\/school(\/|$)/)
  await page.goto('/super-admin/schools')
  // Middleware bounces a non-super away from the super-admin group.
  await expect(page).not.toHaveURL(/\/super-admin\/schools/)
})
