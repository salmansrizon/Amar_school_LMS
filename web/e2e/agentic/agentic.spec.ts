import { test, expect } from '@playwright/test'
// `chromium` the browser launcher (as opposed to the test-runner API) isn't
// re-exported by @playwright/test -- it lives one level down, in the
// playwright-core package @playwright/test itself depends on (always
// installed alongside it; not declared separately here on purpose).
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expectNoError } from '../helpers'
import { checkJevAvailable, runJevGoal } from './jev'

// Agentic smoke suite (tagged @agentic, run via `npm run test:agentic`, kept
// out of the default `npm run test:e2e`): a handful of today's click-paths
// driven by a natural-language goal instead of Playwright selectors, to
// sanity-check that browser-use's jev-ultrafast can still find them. See
// e2e/README.md for what to install and where the API keys go.
//
// Every goal here is read-only (open a menu/drawer/preview, look, stop) --
// nothing creates, edits, or deletes a fixture-school record.
//
// How jev shares the logged-in session: Chromium is launched as a *persistent*
// context (one browser process, one context) with --remote-debugging-port, and
// the owner fixture's storageState cookies are injected into it. jev-ultrafast
// attaches to that same CDP endpoint and opens its own background tab -- since
// a persistent-context browser has only the one context, that tab lands in it
// too and inherits the same cookies. jev never touches a real/personal Chrome.
//
// jev always opens a *new* tab (jev_runner.py deliberately never closes it --
// see its docstring), so each test waits for that `page` event and asserts
// against the resulting tab, not a tab it opened itself.

const PORT = process.env.E2E_PORT ?? '3000'
const BASE_URL = `http://localhost:${PORT}`
const CDP_PORT = process.env.JEV_CDP_PORT ?? '9333'
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`
const AUTH_FILE = path.join(__dirname, '..', '.auth', 'owner.json')
const TRACE_DIR = path.join(__dirname, '..', '..', 'test-results', 'agentic-traces')

const availability = checkJevAvailable()

test.describe('@agentic', () => {
  test.skip(!availability.ok, `jev-ultrafast unavailable, skipping @agentic suite: ${availability.reason}`)
  test.describe.configure({ mode: 'serial' })
  test.slow() // spawns `uv run` + a real model call per goal; well over the default timeout

  let userDataDir: string
  let context: BrowserContext

  test.beforeAll(async () => {
    if (!fs.existsSync(AUTH_FILE)) {
      // The `setup` project (a dependency of this spec's `chromium` project)
      // should have written this; a missing file means it didn't run.
      throw new Error(`${AUTH_FILE} missing -- run the Playwright setup project first`)
    }
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-agentic-'))
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [`--remote-debugging-port=${CDP_PORT}`],
      baseURL: BASE_URL,
    })
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    await context.addCookies([
      ...state.cookies,
      // Force English so jev's goals (written in English) match the on-screen
      // labels -- the app defaults to Bangla (lib/i18n.ts DEFAULT_LANG).
      { name: 'asm-lang', value: 'en', domain: new URL(BASE_URL).hostname, path: '/' },
    ])
  })

  test.afterAll(async () => {
    await context?.close()
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  /** jev opens its own tab; wait for it and hand back that Page. */
  async function runGoalAndGetPage(url: string, goal: string, traceName: string): Promise<{ page: Page; status: string; tracePath: string; error?: string }> {
    const pagePromise = context.waitForEvent('page')
    const result = await runJevGoal({ cdpUrl: CDP_URL, url, goal, traceDir: TRACE_DIR, traceName })
    const page = await pagePromise
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    expect(result.status, `jev bridge failed (trace: ${result.tracePath}) ${result.error ?? ''}`).not.toBe('error')
    expect(result.status, `jev goal timed out (trace: ${result.tracePath})`).not.toBe('timeout')
    return { page, status: result.status, tracePath: result.tracePath, error: result.error }
  }

  test('exam documents: opens the Exam Routine print preview', async () => {
    const { page, tracePath } = await runGoalAndGetPage(
      `${BASE_URL}/school/exams`,
      "On the exams list, open the first exam row's options menu (the vertical-dots / more-actions button), " +
        "click 'Exam Documents', then click the print icon next to 'Exam Routine' to open its print preview. " +
        'Stop as soon as the preview dialog is visible. Do not click the Print button inside it.',
      'exam-documents-routine',
    )
    await expect(page).toHaveURL(/\/school\/exams/)
    await expect(page.getByRole('dialog'), `trace: ${tracePath}`).toBeVisible()
    await expect(page.getByRole('dialog').locator('iframe')).toBeVisible()
    await expectNoError(page)
    await page.close()
  })

  test('students: opens a student drawer showing their fee standing', async () => {
    const { page, tracePath } = await runGoalAndGetPage(
      `${BASE_URL}/school/students`,
      'On the students directory, click the first student row to open their details drawer. ' +
        'Stop as soon as the drawer is open.',
      'students-fee-standing',
    )
    await expect(page.getByRole('dialog'), `trace: ${tracePath}`).toBeVisible()
    await expect(page.getByText('Fee Standing')).toBeVisible()
    await expectNoError(page)
    await page.close()
  })

  test('employees: opens the View attendance popup', async () => {
    const { page, tracePath } = await runGoalAndGetPage(
      `${BASE_URL}/school/employees`,
      "On the employees list, find the first employee's 'View attendance' action (a button, or inside their " +
        "options menu) and click it. Stop as soon as the attendance popup is open.",
      'employees-view-attendance',
    )
    await expect(page.getByRole('dialog'), `trace: ${tracePath}`).toBeVisible()
    await expectNoError(page)
    await page.close()
  })

  test('dashboard: subscription card is visible', async () => {
    const { page, tracePath } = await runGoalAndGetPage(
      `${BASE_URL}/school`,
      'This is the school dashboard home page. Look for a Subscription status card. ' +
        'Take no action either way -- stop immediately once you have looked.',
      'dashboard-subscription-card',
    )
    await expect(page.getByText('Subscription'), `trace: ${tracePath}`).toBeVisible()
    await expectNoError(page)
    await page.close()
  })
})
