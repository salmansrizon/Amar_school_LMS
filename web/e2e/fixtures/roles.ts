import { test as base, expect, type Browser, type Page } from '@playwright/test'
import path from 'node:path'
import type { RoleKey } from '../helpers'

// Per-role authenticated-page fixtures (playwright-crud-plan §2). Each fixture
// opens a fresh context from the storageState global.setup.ts wrote, so a spec
// asks for `superAdminPage` / `distributorPage` / … and starts logged in as that
// role — no per-test login. `asRole(browser, key)` covers the negative/RLS specs
// that need an arbitrary role inline.
const AUTH_DIR = path.join(__dirname, '..', '.auth')
const stateFile = (key: RoleKey) => path.join(AUTH_DIR, `${key}.json`)

/** Open an authenticated page for any role. Caller must close the page's context. */
export async function asRole(browser: Browser, key: RoleKey): Promise<Page> {
  const context = await browser.newContext({ storageState: stateFile(key) })
  return context.newPage()
}

async function usePageAs(browser: Browser, key: RoleKey, use: (p: Page) => Promise<void>) {
  const context = await browser.newContext({ storageState: stateFile(key) })
  const page = await context.newPage()
  await use(page)
  await context.close()
}

export interface RolePages {
  ownerPage: Page
  staffPage: Page
  superAdminPage: Page
  distributorPage: Page
  agentPage: Page
  govPage: Page
}

export const test = base.extend<RolePages>({
  ownerPage: async ({ browser }, use) => usePageAs(browser, 'owner', use),
  staffPage: async ({ browser }, use) => usePageAs(browser, 'staff', use),
  superAdminPage: async ({ browser }, use) => usePageAs(browser, 'super', use),
  distributorPage: async ({ browser }, use) => usePageAs(browser, 'distributor', use),
  agentPage: async ({ browser }, use) => usePageAs(browser, 'agent', use),
  govPage: async ({ browser }, use) => usePageAs(browser, 'gov', use),
})

export { expect }
