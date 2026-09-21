# Final UAT Test Report

Date: 2026-09-21
Branch: `staging`
App: `web/`

## Verdict

**UAT status: NOT READY / FAIL**

The app builds successfully and the core print-rendering test seams pass, but the final end-to-end UI suite has multiple blocking failures across School, Student, Super Admin, SMS/fees/settlements, and seeded-data workflows. This should not be accepted as a final UAT pass yet.

## Environment

- Local app tested through Playwright on `http://localhost:3100` using `E2E_PORT=3100`.
- Existing local dev server also remained available on `http://localhost:3000`.
- Test env loaded from `web/.env.local`.

## Commands run

```powershell
cd web
npm run typecheck
npm run build
npm run lint
$env:E2E_PORT='3100'; npm run test:e2e
$env:E2E_PORT='3100'; npx playwright test e2e/crud/super-admin.*.spec.ts e2e/student/*.spec.ts e2e/messages-hub.spec.ts e2e/roles.spec.ts e2e/features.spec.ts e2e/ux-audit.spec.ts e2e/ux-journeys.spec.ts
$env:E2E_PORT='3100'; npx playwright test e2e/student
npx vitest run tests/unit/print-pieces.test.tsx tests/unit/print-themes.test.ts tests/unit/institute-print.test.ts tests/unit/seat-plan-print.test.ts tests/unit/back-nav.test.ts tests/integration/exam-print-all.test.ts tests/integration/institute-print-header.test.ts tests/integration/print-themes.test.ts tests/integration/print-preview.test.ts --reporter=dot
```

## Gate results

| Gate | Result | Notes |
| --- | --- | --- |
| TypeScript | PASS | Initial run failed on stale `.next/types`; after removing `.next`, `tsc --noEmit` passed. |
| Production build | PASS | `next build` compiled, typechecked, and generated 138 static pages successfully. |
| Lint | FAIL | 13 errors, 11 warnings. See lint blocker section. |
| Full Playwright E2E | FAIL / INCOMPLETE | Started 161 tests; timed out after 900s around test 81 with multiple failures already present. |
| Super Admin + role/UX targeted E2E | FAIL | 56 passed, 7 failed, 1 flaky. |
| Student targeted E2E | FAIL | 36 passed, 3 failed. |
| Print-focused unit/integration seams | PASS | 9 files passed, 93 tests passed. |

## Print status

**Print renderer/data seams passed:**

- `PrintPage` and printable template primitives
- print themes
- institute print header
- seat-plan print grouping
- exam batch print data
- print back-navigation helpers
- print preview data

Result: `9 passed (9), 93 passed (93)`.

**Important caveat:** one UI E2E print-related workflow failed:

- `@crud @school attendance-student-log › finder -> individual log -> Today filter -> print button appears`

So print infrastructure looks healthy, but at least one user-facing print entry point is not UAT-clean.

## Blocking failures found

### Lint blockers

- `app/claim/page.tsx` — React compiler rule: synchronous `setState` inside effect.
- `app/school/exams/exam-controls.tsx` — React compiler rule: synchronous `setState` inside effect.
- `components/shift-selector.tsx` — React hook immutability rule on direct `document.cookie` assignment.
- `e2e/fixtures/roles.ts` — ESLint treats Playwright fixture helpers as invalid React hooks because of names like `usePageAs` / `use`.
- Several unused-variable warnings also remain.

### E2E blockers from the full suite before timeout

- Owner notifications inbox cannot mark/read notice reliably.
- Attendance Student Log flow fails before/at print-button assertion.
- Class/section dropdown filtering fails in:
  - Mark Attendance
  - Attendance Book
  - Student Log finder
  - Students List
- Classes deep CRUD create/list/duplicate/delete fails.
- Fees deep payment/verify/edit amount fails.
- SMS purchase/balance flow fails.
- SMS compose/send/log/debit flow fails.
- Student creation/findability flow fails.

### Super Admin / role / UX targeted failures

- Agreement publish/version creation does not show the newly-created version row.
- Agreement read screen does not show `Recent acceptances`.
- Accepted agreement version is not detected as locked.
- Markdown rendering/editing of agreement version fails.
- Settlement run/approve/pay cannot find the expected draft settlement row.
- Dealer/Gov UX capture times out waiting for `/distributor` load completion, even though navigation reaches `/distributor`.
- Dealer/Gov dead-end journey has the same load-timeout failure.
- One School Owner core-module test was flaky: first run failed on `/school/exams` with `net::ERR_ABORTED`, retry passed.

### Student targeted failures

- Student routine shows empty-state text instead of seeded routine rows.
- School-side student login-management test cannot find `Seed Student A` from the owner student list search.
- Student task completion toggle does not reliably persist across reload / toggle expectation fails.

## UAT recommendation

Do not sign off final UAT yet.

Recommended next steps:

1. Fix lint errors first; they are fast quality gates and may hide runtime issues.
2. Stabilize seed data assumptions: multiple failures reference missing seeded students/routines/rows.
3. Fix School workflow blockers: class/section filtering, attendance log, fees, SMS, student creation.
4. Fix Super Admin agreement and settlement workflows.
5. Re-run targeted failing E2E files until clean.
6. Re-run the full `npm run test:e2e` without timeout failure.
7. After all automated gates pass, perform manual UAT on the print routes and browser print dialogs.

## Artifacts

Playwright screenshots/traces are under:

- `web/test-results/`

Use traces with:

```powershell
cd web
npx playwright show-trace <path-to-trace.zip>
```
