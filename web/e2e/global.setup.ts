import { test as setup } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { ROLES, login } from './helpers'

// Per-role authentication setup (playwright-crud-plan §1.2). Logs in each seeded
// role once and persists its cookies to e2e/.auth/<key>.json, so CRUD specs start
// authenticated via the fixtures in fixtures/roles.ts instead of logging in per
// test. Runs as the `setup` project the `chromium` project depends on.
export const AUTH_DIR = path.join(__dirname, '.auth')

for (const rc of ROLES) {
  setup(`authenticate ${rc.key}`, async ({ page }) => {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    await login(page, rc.email, rc.home)
    await page.context().storageState({ path: path.join(AUTH_DIR, `${rc.key}.json`) })
  })
}
