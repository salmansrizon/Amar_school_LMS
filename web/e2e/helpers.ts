import { expect, type Locator, type Page } from '@playwright/test'

// Shared login for the per-role E2E smoke. Seeded users (seed-test.sql +
// e2e-seed.sql) all share this password.
export const PASSWORD = 'test-password-123!'

/** Stable per-role key — matches the storageState files written by global.setup. */
export type RoleKey =
  | 'owner' | 'staff' | 'super' | 'distributor' | 'agent' | 'gov'
  | 'student' | 'classteacher'

export interface RoleCase {
  key: RoleKey
  role: string
  email: string
  home: RegExp
}

/** One login user per role. Emails are the e2e-seed accounts (seed-test.sql +
 * e2e-seed.sql); all share PASSWORD. */
export const ROLES: RoleCase[] = [
  { key: 'owner', role: 'School Owner', email: 'owner-a@test.local', home: /\/school(\/|$)/ },
  { key: 'staff', role: 'Staff User', email: 'staff-e2e@test.local', home: /\/school(\/|$)/ },
  { key: 'super', role: 'Super Admin', email: 'super@test.local', home: /\/super-admin(\/|$)/ },
  { key: 'distributor', role: 'Distributor', email: 'dealer-e2e@test.local', home: /\/distributor(\/|$)/ },
  { key: 'agent', role: 'Agent', email: 'agent-e2e@test.local', home: /\/agent(\/|$)/ },
  { key: 'gov', role: 'Gov Official', email: 'gov-e2e@test.local', home: /\/gov(\/|$)/ },
  // map #434. The Student lands on /student; the Class Teacher is an ordinary
  // Staff User whose extra reach comes from classes.class_teacher_id (ADR 0017),
  // so their home is /school like any other staff login.
  { key: 'student', role: 'Student', email: 's9001@test-a.students.invalid', home: /\/student(\/|$)/ },
  { key: 'classteacher', role: 'Class Teacher', email: 'teacher-e2e@test.local', home: /\/school(\/|$)/ },
]

/** Look up a role case by key (used by fixtures + global.setup). */
export function roleCase(key: RoleKey): RoleCase {
  const found = ROLES.find((r) => r.key === key)
  if (!found) throw new Error(`unknown role key: ${key}`)
  return found
}

/** Log in via the UI and wait for the role's home route. */
export async function login(page: Page, email: string, home: RegExp): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(home, { timeout: 20_000 })
}

/** Assert the page rendered without a Next.js error overlay / client crash.
 * Deliberately narrow — substrings like "500" or "error" appear in legit UI. */
export async function expectNoError(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible()
  // Next.js dev keeps an always-present <nextjs-portal>; only a real overlay has
  // a dialog with the error label. Match that, not the container.
  await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
  await expect(
    page.getByText('Application error: a client-side exception has occurred', { exact: false }),
  ).toHaveCount(0)
}

/** Per-run unique suffix so parallel/rerun creates don't collide on unique keys
 * (coupon code, plan key, template key, …). */
export function unique(prefix = 'E2E'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

/** A CRUD list assertion: a row (any element) containing `text` is visible. */
export async function expectRowByText(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible()
}

/** The inverse — no row with `text` (post-delete, or RLS-scoped-out). */
export async function expectNoRowByText(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: false })).toHaveCount(0)
}

/** Validation + pg-error surfacing. Today errors render inline in `text-alert-deep`
 * (see playwright-crud-plan §5); assert the message contains `substring`. */
export async function expectInlineError(page: Page, substring: string): Promise<void> {
  await expect(
    page.locator('.text-alert-deep, [role="alert"]').filter({ hasText: substring }).first(),
  ).toBeVisible()
}

/** Picks an option from a shared-UI dropdown (`ui/combobox-field.tsx` /
 *  `ui/select-field.tsx`, both role="combobox") — the `page.selectOption()`
 *  replacement now that these render base-ui Combobox/Select instead of a
 *  native `<select>`. `labelOrLocator` is either the accessible name
 *  (associated `<label>` / `aria-label`, resolved via `getByRole('combobox')`)
 *  or an already-scoped Locator for the control itself, for the cases a
 *  plain name is ambiguous (e.g. two same-named filters on one page).
 *  Types `optionText` to filter when the control is a real text input
 *  (ComboboxField); a SelectField's trigger is a button, so typing is
 *  skipped there — the option list is short enough to just click. */
export async function pickOption(
  page: Page,
  labelOrLocator: string | Locator,
  optionText: string,
): Promise<void> {
  const control = typeof labelOrLocator === 'string' ? page.getByRole('combobox', { name: labelOrLocator }) : labelOrLocator
  await control.click()
  const tagName = await control.evaluate((el) => el.tagName)
  if (tagName === 'INPUT') await control.fill(optionText)
  await page.getByRole('option', { name: optionText, exact: false }).first().click()
}
