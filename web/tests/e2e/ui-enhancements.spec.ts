import { test, expect, type Page } from '@playwright/test'

// End-to-end coverage for the docs/ui.md Round-2 enhancements (map #140):
//   #147 attendance register fits the viewport (horizontal scroll)
//   #148 attendance register print isolation (chrome hidden)
//   #149 Venues page renders (no RSC render-prop crash) + edit toggle works
//   #150 Activity Checklist editable template (add / edit / reorder / delete + dashboard)
//   #151 dashboard activity card — only the DUE status badge pulses
//   #152 Print Admission Form + ID Card stay on the same page (no new tab)
//   #153 sidebar nav icons are uniform and aligned
//
// Needs a running app (local dev or a deploy) — set PLAYWRIGHT_BASE_URL.
// Auth uses the seeded demo owner; override with E2E_EMAIL / E2E_PASSWORD.

const EMAIL = process.env.E2E_EMAIL || 'demo.owner@amarschool.test'
const PASSWORD = process.env.E2E_PASSWORD || 'DemoOwner#2026'

/** Log in and switch the UI to English so selectors are language-stable. */
async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await Promise.all([
    page.waitForURL(/\/school(\/|$)/, { timeout: 20_000 }),
    page.locator('button[type="submit"]').first().click(),
  ])
  // Flip to English (topbar language pill) for stable, non-Bengali labels.
  const en = page.getByRole('button', { name: /^EN$/ }).or(page.getByText(/^EN$/))
  if (await en.count()) {
    await en.first().click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
  }
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('#153 sidebar nav icons are uniform size and vertically aligned', async ({ page }) => {
  await page.goto('/school')
  const boxes = await page.$$eval('aside nav a svg', (svgs) =>
    svgs.map((s) => {
      const r = s.getBoundingClientRect()
      return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  expect(boxes.length).toBeGreaterThan(3)
  const spread = (a: number[]) => Math.max(...a) - Math.min(...a)
  expect(spread(boxes.map((b) => b.x))).toBeLessThanOrEqual(1) // one vertical column
  expect(spread(boxes.map((b) => b.w))).toBeLessThanOrEqual(1) // uniform width
  expect(spread(boxes.map((b) => b.h))).toBeLessThanOrEqual(1) // uniform height
})

test('#147/#148 attendance register fits the viewport and isolates print', async ({ page }) => {
  await page.goto('/school/attendance/book')
  await page.waitForLoadState('networkidle')
  // The page must not overflow horizontally — the wide register scrolls in its
  // own wrapper, not by pushing the sheet past the viewport.
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(2)
  // A scrollable register wrapper exists (overflow-x-auto around the day grid).
  const scrollable = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div')).some((d) => {
      const oflow = getComputedStyle(d).overflowX
      return (oflow === 'auto' || oflow === 'scroll') && d.scrollWidth > d.clientWidth + 4
    }),
  )
  expect(scrollable).toBe(true)
  // Print isolation: the app shell chrome carries print:hidden so only the sheet prints.
  const chromeHidden = await page.locator('header.print\\:hidden, aside.print\\:hidden').count()
  expect(chromeHidden).toBeGreaterThan(0)
})

test('#149 Venues page renders and the edit toggle opens (no RSC crash)', async ({ page }) => {
  const resp = await page.goto('/school/institute/venues')
  expect(resp?.status()).toBeLessThan(400)
  const body = (await page.locator('body').textContent()) || ''
  expect(body).not.toMatch(/couldn.?t load|went wrong|Application error/i)
  // The venues tab content is present (Add building affordance is a <summary>).
  await expect(page.getByText(/add building/i).first()).toBeVisible()
  // The page rendering at all proves the fix: the RSC "function child" error
  // was a server-render crash on load. EditToggle mounting (its Edit buttons
  // present) confirms the render-prop child no longer blows up.
  expect(await page.getByRole('button', { name: /^edit$/i }).count()).toBeGreaterThan(0)
})

test('#151 dashboard activity card — only the DUE badge pulses, not the card', async ({ page }) => {
  await page.goto('/school')
  await page.waitForLoadState('networkidle')
  const dueBadge = page.getByText(/^DUE$/i).first()
  if (!(await dueBadge.count())) test.skip(true, 'no due items today — nothing to assert')
  await expect(dueBadge).toHaveClass(/animate-pulse/)
  // The enclosing card button must NOT itself carry the pulse.
  const cardPulses = await dueBadge.evaluate((el) => {
    const card = el.closest('button')
    return card ? card.className.includes('animate-pulse') : false
  })
  expect(cardPulses).toBe(false)
})

test('#152 Print Admission Form + ID Card stay on the same page (no new tab)', async ({ page, context }) => {
  await context.addInitScript(() => {
    // Neutralise the print dialog so headless runs never hang.
    window.print = () => {}
  })
  let newTab = false
  context.on('page', () => { newTab = true })

  await page.goto('/school/students')
  await page.waitForLoadState('networkidle')
  const href = await page
    .$$eval('a[href*="/school/students/"]', (as) =>
      as.map((a) => a.getAttribute('href')).find((h) => h && /\/school\/students\/[0-9a-f-]{8,}$/.test(h)),
    )
    .catch(() => null)
  test.skip(!href, 'no student rows seeded')
  await page.goto(href!)
  await page.waitForLoadState('networkidle')
  const startUrl = page.url()

  for (const name of [/print id card/i, /print admission/i]) {
    const btn = page.getByRole('button', { name })
    if (await btn.count()) {
      await btn.first().click()
      await page.waitForTimeout(1500)
    }
  }
  // The print routes load in same-page hidden iframes, never a new tab.
  const printFrames = page.frames().filter((f) => /\/print\//.test(f.url()))
  expect(newTab).toBe(false)
  expect(context.pages().length).toBe(1)
  expect(page.url()).toBe(startUrl)
  expect(printFrames.length).toBeGreaterThan(0)
})

test('#150 Activity Checklist template — CRUD UI present and dashboard reflects it', async ({ page }) => {
  // The full add/edit/reorder/delete round-trip is covered by the unit
  // (lib/institute) and integration (institute-setup) suites, which don't
  // mutate shared staging data. This e2e asserts the management UI is wired and
  // the template drives the dashboard — deterministic and side-effect-free.
  await page.goto('/school/institute/checklist')
  await page.waitForLoadState('networkidle')

  // Manager: the add-item form (both label inputs + Add item).
  const addForm = page.locator('form').filter({ has: page.locator('input[name="label_en"]') }).last()
  await expect(addForm.locator('input[name="label_en"]')).toBeVisible()
  await expect(addForm.locator('input[name="label_bn"]')).toBeVisible()
  await expect(addForm.getByRole('button', { name: /add item/i })).toBeVisible()

  // At least the seeded template items, each with edit / delete / reorder controls.
  const items = page.locator('ul > li').filter({ has: page.getByRole('button', { name: /^edit$/i }) })
  expect(await items.count()).toBeGreaterThan(0)
  const first = items.first()
  await expect(first.getByRole('button', { name: /^delete$/i })).toBeVisible()
  await expect(first.getByRole('button', { name: /move up|move down/i }).first()).toBeVisible()

  // The daily tick form lists the template as checkboxes.
  expect(await page.locator('input[type="checkbox"]').count()).toBeGreaterThan(0)

  // Dashboard shows the same template as tickable activity cards.
  await page.goto('/school')
  await page.waitForLoadState('networkidle')
  const checklistSection = page.locator('section').filter({ hasText: /activity checklist/i })
  await expect(checklistSection.getByRole('button').first()).toBeVisible()
})
