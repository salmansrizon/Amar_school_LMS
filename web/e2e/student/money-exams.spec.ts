import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Student fees, exams, results, materials, profile, notifications (WP-D).
// Read-only: nothing is submitted. Fixture: s9001@test-a.students.invalid.

const PAGES: { path: string; tab?: string }[] = [
  { path: '/student/fees' },
  { path: '/student/exams', tab: '/student/exams' },
  { path: '/student/results', tab: '/student/results' },
  { path: '/student/materials', tab: '/student/materials' },
  { path: '/student/profile' },
  { path: '/student/notifications' },
]

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  for (const { path, tab } of PAGES) {
    test(`@student ${path} renders at ${width}px`, async ({ studentPage: page }) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(String(e)))

      await page.setViewportSize({ width, height })
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      if (tab) await expect(page.locator('main nav a[aria-current="page"]')).toHaveAttribute('href', tab)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expectNoError(page)
      expect(errors).toEqual([])
    })
  }
}

test('@student result detail shows raw marks and no print link while grades are unreadable', async ({ studentPage: page }) => {
  await page.goto('/student/results')
  await page.locator('main a[href^="/student/results/"]').first().click()
  await page.waitForURL(/\/student\/results\/[^/]+$/)
  const main = page.locator('main')
  // A subject row with obtained / full, the total, and the grade-unavailable
  // note; no print entry point, because that route 404s for a student (#702).
  await expect(main.locator('tbody tr').first()).toContainText(/\d+\s*\/\s*\d+|[০-৯]+\s*\/\s*[০-৯]+/)
  await expect(main.getByText(/Grades are not available yet|গ্রেড এখনো দেখানো যাচ্ছে না/)).toBeVisible()
  await expect(main.locator('a[href$="/print"], button:has-text("mark sheet"), button:has-text("মার্কশিট")')).toHaveCount(0)
})
