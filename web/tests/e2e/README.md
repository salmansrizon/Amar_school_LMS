# UI enhancement E2E tests (Playwright)

End-to-end browser coverage for the **docs/ui.md** enhancements (map #140):

| Test | Feature |
|------|---------|
| #153 | Sidebar nav icons uniform + vertically aligned |
| #147/#148 | Attendance register fits the viewport (horizontal scroll) + print isolates the sheet |
| #149 | Venues page renders (no RSC render-prop crash) |
| #151 | Dashboard activity card — only the DUE status badge pulses |
| #152 | Print Admission Form + ID Card stay on the same page (no new tab) |
| #150 | Activity Checklist template CRUD UI + dashboard reflects it |

The heavy add/edit/reorder/delete round-trip for #150 is covered by the **unit**
(`tests/unit/institute.test.ts`) and **integration** (`tests/integration/institute-setup.test.ts`)
suites, which don't mutate shared data. These e2e tests are read-only /
non-destructive so they're safe to run against a shared staging deploy.

## Running

Needs a running app. Point Playwright at it with `PLAYWRIGHT_BASE_URL`
(defaults to `http://localhost:3140`).

```bash
# one-time: install the browser
npx playwright install chromium

# against a local dev server
npm run dev -- -p 3140          # in one shell
PLAYWRIGHT_BASE_URL=http://localhost:3140 npm run test:e2e

# against a deploy
PLAYWRIGHT_BASE_URL=https://<deploy-url> npm run test:e2e
```

Auth uses the seeded demo owner (`demo.owner@amarschool.test`). Override with
`E2E_EMAIL` / `E2E_PASSWORD`. Tests switch the UI to English after login so
selectors are language-stable.

`npm run test:e2e:report` opens the last HTML report.
