# Playwright UI Testing Plan — CRUD across the portal (master_prd.md)

End-to-end UI test plan covering every **CRUD / actionable** surface delivered on the
unified portal (map #284) plus the stable PRD school modules. Scope is the *user-facing
UI path* (form → server action/RPC → RLS write → re-render), not unit logic (covered by
`tests/unit`) or DB RLS internals (covered by `tests/integration`).

## 1. Test infrastructure (existing)

- **Runner:** Playwright, `web/playwright.config.ts` — `testDir: ./e2e`, `baseURL:
  http://localhost:3000`, chromium project, `webServer` boots the app.
- **Login helper:** `e2e/helpers.ts` → `login(page, email, home)`, shared `PASSWORD`,
  `ROLES[]`, `expectNoError(page)`.
- **Seed data:** `web/supabase/*-seed.sql` (e2e/test) + migration `0110` demo tenant
  (distributor/agent/leads/tasks/coupons/wallets/invoices).

### Pre-work (fix before the CRUD suite lands)
1. **`ROLES` is stale:** distributor `home` is `/dealer` → must be `/distributor`
   (rename #271/#107). Add an `agent` role case. Update `e2e/helpers.ts`.
2. **Per-role auth fixtures:** add Playwright `storageState` per role (owner, staff,
   super-admin, distributor, agent, gov) generated once in a `global.setup.ts`, so specs
   start authenticated instead of logging in each test.
3. **Seed accounts for CRUD:** point the suite at the `0110` demo logins
   (`demo.super/owner/staff/distributor/agent@amarschool.test`) on the shared test DB, or
   extend `e2e-seed.sql` with distributor_profiles + agreement + sms_packages so every
   create/read has a precondition row.

### Data strategy (idempotent, isolated)
- **Creates** use a per-run unique suffix (`E2E-${Date.now()}`) so reruns don't collide
  on unique keys (coupon `code`, plan `key`, template `key`, workflow `key`, agreement
  version).
- **Teardown** in `afterEach`/`afterAll`: delete rows the test created (service-role
  helper), or assert-then-delete via the same UI (delete path doubles as a test).
- **Read/Update/Delete** tests target a row the test just created (self-contained),
  never a shared seed row, to stay parallel-safe.
- Tag specs `@crud @<role>` for selective runs.

## 2. Structure

```
e2e/
  global.setup.ts            # per-role storageState
  helpers.ts                 # login, ROLES (fixed), unique(), cleanup()
  fixtures/roles.ts          # test.extend: superAdminPage, distributorPage, ...
  pages/                     # thin page objects (locators + actions) per surface
  crud/
    super-admin.coupons.spec.ts
    super-admin.agreements.spec.ts
    super-admin.notifications.spec.ts
    super-admin.module-config.spec.ts
    super-admin.subscription-config.spec.ts
    super-admin.roles.spec.ts
    super-admin.sms-commerce.spec.ts
    super-admin.settlements.spec.ts
    super-admin.workflows.spec.ts
    super-admin.distributor-lifecycle.spec.ts
    super-admin.invoices.spec.ts
    distributor.crm.spec.ts
    distributor.onboarding.spec.ts
    distributor.invoices.spec.ts
    agent.tasks.spec.ts
    school.students.spec.ts        # + employees/classes/exams/fees (PRD modules)
    school.sms.spec.ts             # compose + buy-package
    school.approvals.spec.ts
  cross/
    shell.nav.spec.ts          # AppShell nav per role
    search.spec.ts             # ⌘K nav + record search per role
    notifications.spec.ts      # bell + inbox mark-read
    rbac.spec.ts               # negative: role can't reach another group / can't write
```

Convention per spec: `describe(surface)` → one `test` per CRUD verb, each self-contained
(create its own precondition), ending with `expectNoError(page)`.

## 3. Per-surface CRUD matrix

Each cell = a test. **C**reate / **R**ead(list+detail) / **U**pdate / **D**elete / **A**ction.
Every surface also gets an **RLS-negative** test (a non-owning role sees no write path / 403).

### Super Admin (`/super-admin/*`, `demo.super`)
| Surface | C | R | U | D | Action | Key assertions |
|---|---|---|---|---|---|---|
| Coupons `/coupons` | ✅ code+percent/flat+expiry | list row appears | — | ✅ delete row | activate/deactivate toggle | flat value shows `formatTaka`; dup code → inline error |
| Agreements `/agreements` | ✅ new version | version list + acceptances | — | ✅ delete (blocked once accepted → error shown) | — | version = max+1; accepted version shows "locked" |
| Notification templates `/notifications` | ✅ upsert template (bn/en) | template + placeholders | ✅ re-upsert same key | ✅ delete (FK-guarded) | add/remove channel route | placeholders chips reflect `{{vars}}` |
| Module/feature config `/module-config` | ✅ module + feature | tree by module | ✅ feature default_state select | ✅ delete feature/module | add/remove dependency | self-dep rejected; dup dep error |
| Subscription config `/subscription-config` | ✅ plan | plans + matrix | ✅ pricing save (taka→poisha) | ✅ delete plan (school_plan FK error path) | plan×feature toggle | pricing round-trips; default badge |
| Roles/permissions `/role-permissions` | — | matrix grid | ✅ toggle cell grant/revoke | — | — | cell reflects grant; optimistic revert on error |
| SMS commerce `/sms-commerce` | ✅ package | packages + rates + school wallets | ✅ rate save per route | ✅ delete package | activate/deactivate | rate prefilled in taka |
| Settlements `/settlements` | ✅ run (distributor+period) | list + unsettled | — | — | approve & pay (draft→paid) | approve only on draft; total from accrued |
| Workflows `/workflows` | ✅ definition + stage | defs + stages + inbox | — | ✅ delete def/stage | activate/deactivate | stage auto-seq; inbox lists in-progress |
| Distributor lifecycle `/partners/[id]` | — | KYC block | ✅ status transition | — | approve→(DistributorApproved) | status badge updates |
| Invoices `/invoices` | ✅ bill a distributor | list (school+distributor party) | — | — | — | party column resolves; paid total |

### Distributor (`/distributor/*`, `demo.distributor`)
| Surface | C | R | U | D | Action | Assertions |
|---|---|---|---|---|---|---|
| CRM `/crm` + `/crm/[id]` | ✅ add lead | board by stage + detail | ✅ stage advance | — | — | lead moves column; own-only (RLS) |
| Onboarding `/onboarding` | — | standing + won leads + tasks | — | — | accept agreement | status flips to "accepted" |
| Invoices `/invoices` + `/invoices/[id]` | — | list + detail | — | — | record payment; **print** (`window.print`) | payment row pending; chrome `print:hidden` |
| Wallet `/wallet` | — | balance + ledger | — | — | — | balance = ledger sum |

### Agent (`/agent/*`, `demo.agent`)
| Tasks `/tasks` + `/tasks/[id]` | — | list + detail | ✅ mark done / reopen | — | — | status toggles; assignee-only (RLS) |

### School (`/school/*`, `demo.owner` + `demo.staff`)
- **PRD modules** (stable, regression-level CRUD): students, employees, classes,
  attendance, exams, fees — one C/R/U/D happy-path each; **staff-grant negative** (a
  staff user without the screen grant can't open/write it).
- **SMS** `/sms`: compose recipients + segment count; `/sms/buy` owner buys a package →
  wallet balance increases; **staff blocked** from buy (owner-only).
- **Approvals** `/school/approvals`: owner approves/rejects an in-progress instance →
  it leaves the list; staff (non-approver) gets the RPC error.

### Gov (`/gov`, `demo` gov account) — read-only
- Territory KPIs + schools list render; search over territory schools; **no write paths**.

## 4. Cross-cutting suites

- **Shell/nav:** each role lands on the shared AppShell; sidebar shows that role's nav;
  collapse toggle persists (cookie); mobile drawer opens.
- **Search:** ⌘K opens palette; nav-section results for every role; type ≥2 chars →
  record hits (super-admin→school/distributor/agent/gov/invoice; distributor→lead/
  territory; agent→task; school→student/employee); Enter navigates.
- **Notifications:** bell shows unread dot; dropdown lists; mark-read clears dot;
  `/notifications` inbox mark-all; event-driven notice appears (approve a distributor →
  distributor sees "Account approved").
- **RBAC negative (`rbac.spec.ts`):** each role visiting another group's route is
  redirected to its own home (`canAccess`); no cross-role write path is reachable.
- **i18n:** language toggle flips bn/en on a sampled page.
- **a11y smoke:** nav has an accessible name; matrix toggles expose `aria-pressed`;
  `prefers-reduced-motion` respected (assert reduced transition).

## 5. Assertion helpers to add
- `expectRowByText(table, text)` / `expectNoRowByText` — CRUD list assertions.
- `expectInlineError(form, substring)` — validation + pg-error surfacing (e.g. dup code).
- `expectToast/aria-live` if added later; today errors render inline (`text-alert-deep`).
- `asRole(role)` fixture returning an authenticated page.

## 6. Execution
- Local: `npx playwright test` (webServer boots app); CRUD tags `--grep @crud`.
- CI: run against a disposable Supabase branch or the shared test DB with the seed
  applied; per-role `storageState` built in `global.setup.ts`.
- Money in poisha — assert on rendered `formatTaka` strings (`৳`), not raw integers.

## 7. Out of scope / known gaps to encode as skips
- Super-admin **platform** workflow decisions (null-school) — RPC tenant gate; mark
  `test.fixme`.
- Agent task-assigned + approval-requested notifications — no source event yet;
  `test.fixme` until wired.
