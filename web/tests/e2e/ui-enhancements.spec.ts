import { test, expect } from '@playwright/test'

// End-to-end coverage for the docs/ui.md Round-2 enhancements (map #140):
//   #147 attendance register fits the viewport (horizontal scroll)
//   #148 attendance register print isolation (chrome hidden)
//   #149 Venues page renders (no RSC render-prop crash) + edit toggle works
//   #150 Activity Checklist editable template (add / edit / reorder / delete + dashboard)
//   #151 dashboard activity card — only the DUE status badge pulses
//   #152 Print Admission Form + ID Card stay on the same page (no new tab)
//   #153 sidebar nav icons are uniform and aligned
//
// Needs a running app (local dev or a deploy) — set PLAYWRIGHT_BASE_URL. Auth is
// handled once by auth.setup.ts (storageState), so these tests start signed in
// as the demo owner with the UI in English.

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

test('#150 Activity Checklist template — add, edit, reorder, delete + dashboard reflects it', async ({ page }) => {
  test.setTimeout(90_000)
  const stamp = Date.now()
  const label = `E2E Item ${stamp}`
  const edited = `E2E Edited ${stamp}`
  page.on('dialog', (d) => d.accept()) // delete confirm
  const settle = () => page.waitForLoadState('networkidle')

  // Manager list rows are <li>; the add form lives in a trailing <form>. Scope
  // by structure, not by text, so a row entering edit mode (text -> inputs)
  // stays addressable.
  const rows = page.locator('ul > li').filter({ has: page.getByRole('button', { name: /^edit$/i }) })
  const rowByText = (txt: string) => page.locator('ul > li').filter({ hasText: txt })

  // Delete every E2E row, tolerating the re-render detach between locating and
  // clicking (each delete revalidates the list).
  const deleteE2E = async () => {
    for (let i = 0; i < 25; i++) {
      if (!(await rowByText('E2E ').count())) break
      await rowByText('E2E ').first().getByRole('button', { name: /^delete$/i }).click({ timeout: 5000 }).catch(() => {})
      await settle()
      await page.waitForTimeout(200)
    }
    await expect(rowByText('E2E ')).toHaveCount(0)
  }

  await page.goto('/school/institute/checklist')
  await settle()
  await deleteE2E()
  const before = await rows.count()

  // ADD
  const addForm = page.locator('form').filter({ has: page.locator('input[name="label_en"]') }).last()
  await addForm.locator('input[name="label_en"]').fill(label)
  await addForm.locator('input[name="label_bn"]').fill(`${label} BN`)
  await addForm.getByRole('button', { name: /add item/i }).click()
  await expect(rowByText(label)).toHaveCount(1)
  expect(await rows.count()).toBe(before + 1)
  await settle()

  // REORDER — new item is last; move it up, then back down (asserts both work).
  const target = rowByText(label).first()
  await expect(target.getByRole('button', { name: /move up/i })).toBeEnabled()
  await target.getByRole('button', { name: /move up/i }).click()
  await settle()
  await expect(rowByText(label).first().getByRole('button', { name: /move down/i })).toBeEnabled()
  await rowByText(label).first().getByRole('button', { name: /move down/i }).click()
  await settle()
  await expect(rowByText(label)).toHaveCount(1)

  // EDIT — reload first so the row is a clean mount (a reorder transition can
  // otherwise leave its inline Save button briefly disabled). The editing row
  // is the only <li> with a <form>.
  await page.goto('/school/institute/checklist')
  await settle()
  await rowByText(label).first().getByRole('button', { name: /^edit$/i }).click()
  const editForm = page.locator('ul > li form').filter({ has: page.locator('input[name="label_en"]') })
  await expect(editForm.locator('input[name="label_en"]')).toBeVisible()
  await editForm.locator('input[name="label_en"]').fill(edited)
  const saveBtn = editForm.getByRole('button', { name: /^save$/i })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await expect(rowByText(edited)).toHaveCount(1)
  await expect(rowByText(label)).toHaveCount(0)
  await settle()

  // DASHBOARD reflects the edited template.
  await page.goto('/school')
  await settle()
  await expect(page.getByText(edited).first()).toBeVisible()

  // DELETE — leaves the template as it started.
  await page.goto('/school/institute/checklist')
  await settle()
  await rowByText(edited).first().getByRole('button', { name: /^delete$/i }).click()
  await expect(rowByText(edited)).toHaveCount(0)
  expect(await rows.count()).toBe(before)
})
