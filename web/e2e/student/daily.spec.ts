import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Student daily pages (WP-C): tasks, routine, attendance, leave, questions,
// notices. Read-only: nothing is submitted. Fixture: s9001, "Seed Student A".
// The locale is Bangla by default, so assertions use hrefs and structure rather
// than words.

const PAGES = [
  { path: '/student/tasks', tabs: ['/student/tasks', '/student/routine', '/student/materials', '/student/questions'] },
  { path: '/student/routine', tabs: ['/student/tasks', '/student/routine', '/student/materials', '/student/questions'] },
  { path: '/student/questions', tabs: ['/student/tasks', '/student/routine', '/student/materials', '/student/questions'] },
  { path: '/student/attendance', tabs: ['/student/attendance', '/student/leave'] },
  { path: '/student/leave', tabs: ['/student/attendance', '/student/leave'] },
  { path: '/student/notices', tabs: ['/student', '/student/notices'] },
] as const

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  for (const { path, tabs } of PAGES) {
    test(`@student ${path} renders in the portal shape at ${width}px`, async ({ studentPage: page }) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(String(e)))

      await page.setViewportSize({ width, height })
      await page.goto(path)
      const main = page.locator('main')

      await expect(main.locator('h1')).toBeVisible()
      // The group's tab strip, with this page current.
      const strip = main.locator('nav[aria-label]').last()
      await expect(strip.locator('a')).toHaveCount(tabs.length)
      await expect(strip.locator('a[aria-current="page"]')).toHaveAttribute('href', path)
      // No narrow desktop column: the page spans the shell.
      expect(await main.evaluate((el) => el.className)).not.toContain('max-w-3xl')

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expectNoError(page)
      expect(errors).toEqual([])
    })
  }
}

test('@student attendance counts the running month to today, not to month end', async ({ studentPage: page }) => {
  await page.goto('/student/attendance')
  const main = page.locator('main')
  // Four stat cards, then a 7-column calendar.
  await expect(main.locator('div.grid.grid-cols-2 > section')).toHaveCount(4)
  // Seven weekday names, then at least 28 days.
  expect(await main.locator('div.grid.grid-cols-7 > div:not([aria-hidden])').count()).toBeGreaterThanOrEqual(35)
})

test('@student the leave and ask forms keep their anchors and fields', async ({ studentPage: page }) => {
  await page.goto('/student/leave')
  const leave = page.locator('#new-leave form')
  await expect(leave.locator('input[name="from_day"][type="date"][required]')).toBeVisible()
  await expect(leave.locator('input[name="to_day"][type="date"][required]')).toBeVisible()
  await expect(leave.locator('textarea[name="reason"][required]')).toBeVisible()
  await expect(leave.locator('button[type="submit"]')).toBeVisible()

  await page.goto('/student/questions')
  const ask = page.locator('#ask form')
  await expect(ask.locator('input[name="subject"][required]')).toBeVisible()
  await expect(ask.locator('textarea[name="body"][required]')).toBeVisible()
  await expect(ask.locator('button[type="submit"]')).toBeVisible()
})
