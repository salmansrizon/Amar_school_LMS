# UAT Failure Analysis and Fix Recommendations

Source: [`docs/UAT_TEST_REPORT.md`](../UAT_TEST_REPORT.md)

Status: documentation and planning only. Do not treat this file as proof that defects are fixed.

## UAT verdict

The final UAT run is **not ready for sign-off**. Build and print seams are healthy, but end-to-end user workflows still fail. The failures should be fixed in focused slices, then the same targeted E2E files should be rerun before the full suite is attempted again.

## Fix strategy

1. **Stabilize gates first**: lint, typecheck, build.
2. **Stabilize seed-data assumptions**: many failures indicate tests expect seeded students, routines, class offerings, agreements, or settlement rows that the UI cannot currently find.
3. **Fix the School daily workflows**: Students, class/section filtering, attendance log, fees, SMS.
4. **Fix Super Admin commercial/governance workflows**: agreements and settlements.
5. **Only combine UX redesign where it overlaps a failing workflow**: Students and Employees should adopt the Record Quick View pattern while their list/detail flows are fixed.
6. **Re-run targeted files first**, then the full Playwright suite.

## Failure matrix

| Failure area | Observed failure | Likely class of issue | Recommended fix | Priority |
| --- | --- | --- | --- | --- |
| Lint gate | React compiler / hook lint errors in `claim`, exam controls, shift selector, E2E fixtures | Code quality / lint configuration | Fix real app lint errors directly. For Playwright fixtures, rename helper functions so ESLint does not classify them as React hooks, or exclude E2E fixtures from React hook rules. | P0 |
| Notifications | Owner inbox cannot mark/read notice reliably | State persistence, selector drift, or seed mismatch | Inspect notification read action, reload persistence, and owner notification seed. Add a focused test for mark-read idempotency. | P1 |
| Student list findability | Created/seeded student cannot be found in `/school/students` | Filter/query mismatch, academic-year/shift visibility, seed mismatch, or stale list refresh | Confirm whether Students List is narrowed by Global Academic Year Selection and Global Shift Selection. Ensure search includes current enrollment and refreshes after creation. | P0 |
| Class/section dropdowns | Mark Attendance, Attendance Book, Student Log, Students List filtering fail | Shared class-offering selection model inconsistent across screens | Extract/standardize one Class Offering picker contract for browse/manage surfaces; verify Academic Year + Shift selection behavior. | P0 |
| Attendance Student Log print entry | Individual log / Today filter / print button does not appear | Data not found after filter, print button hidden due no rows, or date mismatch | Fix roster/log data resolution first; then verify print button appears only when printable rows exist. | P1 |
| Classes CRUD | Create/list/duplicate/delete fails | Form save, uniqueness copy/archive rule, or test seed collision | Reproduce with trace; confirm Class Offering identity fields: name, section, year, shift, group department. | P1 |
| Fees | Record payment -> verify -> edit amount fails | Fee Collection Record update/readback mismatch | Preserve domain rule: one Fee Collection Record per Student/month. Fix save -> receipt -> edit round trip. | P0 |
| SMS | Buy package balance rise and compose/send/debit fail | Wallet mutation, log creation, or insufficient-credit test setup | Verify SMS balance source, segment debit calculation, and log row creation. Add explicit recovery state for insufficient credit. | P1 |
| Student routine | Student sees empty routine instead of seeded week | Student enrollment/class offering mismatch or routine publication query mismatch | Reconcile student routine query with current Enrollment/Class Offering, Academic Year, and Shift. | P0 |
| Student task toggle | Completion does not survive reload reliably | Persistence/action/revalidation issue or initial state collision | Make toggle idempotent; after action, revalidate and assert against stored state, not optimistic UI only. | P1 |
| Super Admin agreements | Publish/read/locked/Markdown edit failures | Agreement version UI no longer matches tests or server action does not persist/read expected rows | Decide expected Agreement UI contract, then fix publish -> list -> accepted/locked -> markdown edit cycle. | P1 |
| Super Admin settlements | Draft settlement row not found after run | Accrual seed mismatch, period mismatch, or total formatting mismatch | Verify settlement run result, period filters, and money formatting; display created draft deterministically after run. | P1 |
| Distributor/Gov UX capture | Login reaches `/distributor`, but `waitForURL` times out waiting for load | Test wait condition too strict or page never reaches load due hanging request | Prefer `waitForURL(..., waitUntil: 'domcontentloaded')` or wait for stable visible landmark; inspect long-running requests. | P2 |
| `/school/exams` flaky abort | First navigation aborts, retry passes | Dev-server/build race or page load instability | Re-run after fixing server/test stability; inspect console/network only if repeatable. | P2 |

## Recommended target reruns

After fixes, rerun in this order:

```powershell
cd web
npm run lint
npm run typecheck
npm run build
$env:E2E_PORT='3100'; npx playwright test e2e/crud/school.students.spec.ts e2e/student/school-side.spec.ts
$env:E2E_PORT='3100'; npx playwright test e2e/crud/school.class-section-select.spec.ts e2e/crud/school.attendance.student-log.spec.ts
$env:E2E_PORT='3100'; npx playwright test e2e/crud/school.fees.deep.spec.ts e2e/crud/school.sms.spec.ts
$env:E2E_PORT='3100'; npx playwright test e2e/student
$env:E2E_PORT='3100'; npx playwright test e2e/crud/super-admin.agreements.spec.ts e2e/crud/super-admin.settlements.spec.ts
$env:E2E_PORT='3100'; npm run test:e2e
```

## UX adjustment tied to UAT fixes

The Student and Employee list/detail failures should be fixed while introducing the first **Record Quick View** implementation:

- Student List row click opens a right-side Student Profile drawer.
- Employee List row click opens a right-side Employee Profile drawer.
- On mobile, the drawer becomes a full-screen sheet.
- The detail routes stay, but render the same profile/edit model for direct links, search results, refreshes, and print/advanced actions.
- The edit icon switches the drawer/page into full edit mode for the record.
- Save/cancel returns to profile mode and refreshes the list row.

This should reduce route-hopping while preserving existing deep links and tests.

## Acceptance criteria for UAT recovery

- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- Every targeted failing E2E file listed above passes without retry-only success.
- Full `npm run test:e2e` completes without timeout and without failed tests.
- Student and Employee lists support Record Quick View without breaking direct detail URLs.
- Print-focused tests remain green, and Attendance Student Log print entry passes from the UI.
