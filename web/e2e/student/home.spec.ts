import { test, expect } from '../fixtures/roles'
import { expectNoError } from '../helpers'

// Student home dashboard (WP-B). Read-only: nothing is submitted.
// Fixture: s9001@test-a.students.invalid, "Seed Student A".

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`@student home dashboard renders at ${width}px`, async ({ studentPage: page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.setViewportSize({ width, height })
    await page.goto('/student')
    const main = page.locator('main')

    await expect(main.locator('h1')).toHaveText('Seed Student A')
    await expect(main.getByText('S9001')).toBeVisible()
    // The group's tabs: Home (current) and Notices.
    await expect(main.locator('nav a[aria-current="page"]')).toHaveAttribute('href', '/student')
    await expect(main.locator('nav a[href="/student/notices"]')).toBeVisible()

    // Either the "needs you now" strip (each row has an action into the portal)
    // or the all-clear card (links to Tasks and Routine): never neither. Both
    // are the first <section> after the header and tabs.
    const first = main.locator('> section').first()
    await expect(first.locator('h2')).toBeVisible()
    await expect(first.locator('a[href^="/student/"]').first()).toBeVisible()

    // Four stat cards, each with a label, a value and a way in.
    const cards = main.locator('div.grid.grid-cols-2 > section')
    await expect(cards).toHaveCount(4)
    for (const href of ['/student/attendance', '/student/fees', '/student/tasks']) {
      await expect(cards.locator(`a[href="${href}"]`)).toBeVisible()
    }
    await expect(cards.locator('a[href^="/student/results"]')).toBeVisible()
    for (let i = 0; i < 4; i++) await expect(cards.nth(i).locator('p').first()).not.toBeEmpty()
    // 2 x 2 on a phone, 4 in a row on desktop.
    const tops = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(width < 1280 ? 2 : 1)

    // No grade, GPA or pass/fail on the home (#702).
    await expect(main).not.toContainText(/GPA|জিপিএ|গ্রেড|Grade/)

    // Routine, upcoming and notices cards all say something.
    for (const card of await main.locator('div.grid.lg\\:grid-cols-3 section').all()) {
      await expect(card.locator('h2')).toBeVisible()
      await expect(card.locator('ul, p').first()).toBeVisible()
    }

    // No horizontal page scroll.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expectNoError(page)
    expect(errors).toEqual([])
  })
}
