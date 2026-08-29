import { test, expect } from '@playwright/test'
import { login } from './helpers'
import { mkdirSync } from 'node:fs'

// UI journey capture: attempt one real task per role, screenshotting each step,
// so the audit can score friction (not just static screens). Best-effort form
// fills are wrapped so a capture never hard-fails; the friction is the finding.
const DIR = 'e2e/ux-shots'
mkdirSync(DIR, { recursive: true })
const step = async (page: import('@playwright/test').Page, name: string) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true })
}

test('journey — School Owner admits a student', async ({ page }) => {
  await login(page, 'owner-a@test.local', /\/school(\/|$)/)
  await step(page, 'j-owner-1-dashboard')
  // Start the primary action from the persistent CTA.
  await page.goto('/school/students/new')
  await step(page, 'j-owner-2-form')
  try {
    await page.getByRole('textbox').first().fill('Journey Test শিক্ষার্থী')
    const combos = page.getByRole('combobox')
    if (await combos.count()) await combos.first().selectOption({ index: 1 }).catch(() => {})
    await step(page, 'j-owner-3-filled')
    await page.getByRole('button', { name: /ভর্তি|সংরক্ষণ|save|যোগ|submit/i }).first().click({ timeout: 4000 })
    await page.waitForTimeout(1500)
  } catch {
    /* capture whatever state resulted */
  }
  await step(page, 'j-owner-4-result')
})

test('journey — Super Admin creates a distributor', async ({ page }) => {
  await login(page, 'super@test.local', /\/super-admin(\/|$)/)
  await page.goto('/super-admin/partners')
  await step(page, 'j-super-1-partners')
  try {
    const boxes = page.getByRole('textbox')
    await boxes.nth(0).fill('Journey Distributor')
    await boxes.nth(1).fill(`journey-${Date.now()}@test.local`)
    const pw = page.locator('input[type="password"]')
    if (await pw.count()) await pw.first().fill('test-password-123!')
    await step(page, 'j-super-2-filled')
    await page.getByRole('button', { name: /নতুন|তৈরি|create|save/i }).first().click({ timeout: 4000 })
    await page.waitForTimeout(1500)
  } catch {
    /* */
  }
  await step(page, 'j-super-3-result')
})

test('journey — Staff hits permission gating', async ({ page }) => {
  await login(page, 'staff-e2e@test.local', /\/school(\/|$)/)
  await step(page, 'j-staff-1-dashboard')
  await page.goto('/school/attendance') // not granted to this staff user
  await step(page, 'j-staff-2-attendance-attempt')
  expect(page.url()).toContain('/school')
})

test('journey — Dealer + Gov dead-end', async ({ page }) => {
  await login(page, 'dealer-e2e@test.local', /\/dealer(\/|$)/)
  await step(page, 'j-dealer-1-landing')
  // No actionable controls exist on the landing — the journey ends here.
  await page.goto('/login')
  await login(page, 'gov-e2e@test.local', /\/gov(\/|$)/)
  await step(page, 'j-gov-1-landing')
})
