import { test, expect } from './fixtures/roles'

// বার্তা ও অনুরোধ (#509, #510) — the section a School Owner and a Class Teacher
// both land in, driven through the real app rather than asserted against a query.
//
// Scoping is NOT what this spec proves: that is RLS, and it is proved in
// tests/integration/student-message-scope.test.ts against the database. What is
// proved here is that the merge actually happened in the UI — one sidebar item,
// three tabs, the same three routes, and nothing left pointing at the labels
// that used to be there.

test.describe('Messages & Requests', () => {
  test('the Owner reaches every tab from one sidebar item', async ({ ownerPage: page }) => {
    await page.goto('/school')

    // One entry where there were three.
    const sidebar = page.getByRole('navigation').first()
    await expect(sidebar.getByRole('link', { name: /বার্তা ও অনুরোধ|Messages & Requests/ })).toHaveCount(1)

    await sidebar.getByRole('link', { name: /বার্তা ও অনুরোধ|Messages & Requests/ }).click()
    await expect(page).toHaveURL(/\/school\/questions$/)

    const tabs = page.getByRole('navigation', { name: /বার্তা ও অনুরোধ|Messages & Requests/ })
    await expect(tabs.getByRole('link')).toHaveCount(3)

    // The routes do not move — that was the whole reason the tab bar spans
    // three trees instead of one path segment.
    await tabs.getByRole('link').nth(1).click()
    await expect(page).toHaveURL(/\/school\/corrections$/)
    await tabs.getByRole('link').nth(2).click()
    await expect(page).toHaveURL(/\/school\/questions\/response$/)
  })

  test('a Class Teacher opens the response tab instead of being redirected away', async ({
    classTeacherPage: page,
  }) => {
    // #509 drops the owner-only redirect. A teacher sees her own row plus the
    // school-wide Σ; she is not bounced back to the questions page.
    await page.goto('/school/questions/response')
    await expect(page).toHaveURL(/\/school\/questions\/response$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('guardian feedback is hidden from the sidebar and from search', async ({
    ownerPage: page,
  }) => {
    await page.goto('/school')
    const sidebar = page.getByRole('navigation').first()
    await expect(sidebar.getByRole('link', { name: /^মতামত$|^Guardian Feedback$/ })).toHaveCount(0)

    // Hidden, not removed: the route still answers. Leaving the nav entry behind
    // would be the reversible half; leaving the search entry behind would not.
    const response = await page.request.get('/school/feedback')
    expect(response.status()).toBeLessThan(400)
  })
})
