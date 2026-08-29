# UAT Plan — human acceptance testing (Amar School / EdumeBD portal)

Scenario-driven acceptance testing by real people, complementing the automated
Playwright CRUD suite (`playwright-crud-plan.md`). Playwright proves *the buttons
work*; UAT proves *the product makes sense to the humans who use it* — a Bangla-first,
non-technical school user on a cheap Android phone, a field agent, a distributor running
a territory, and the platform owner.

## 1. Environment & accounts

- **URL:** https://staging.edumebd.com (staging branch; shared staging+main DB).
- **Devices (test on all):** low-end Android (Chrome), mid iPhone (Safari), desktop
  Chrome. Bandwidth: throttle to 3G/slow-4G at least once per journey.
- **Language:** run every journey **once in Bangla, once in English** (toggle in topbar).
- **Demo logins** (seed 0054/0066/0110 — throwaway, reset freely):

| Role | Login | Password |
|---|---|---|
| Super Admin | demo.super@amarschool.test | DemoSuper#2026 |
| School Owner | demo.owner@amarschool.test | DemoOwner#2026 |
| School Staff | demo.staff@amarschool.test | DemoStaff#2026 |
| Distributor | demo.distributor@amarschool.test | DemoDist#2026 |
| Agent | demo.agent@amarschool.test | DemoAgent#2026 |

> Gov official has no seeded demo — Super Admin creates one during Journey S-6.

## 2. How to run UAT

- **Testers:** ideally 1 real school admin + 1 non-technical staff + internal reps for
  distributor/agent/super-admin. Minimum: one person role-playing each persona.
- **Per test case:** follow the *goal* (not click-by-click), record **Pass / Fail /
  Confusing**, note device+language, and capture a screenshot on Fail/Confusing.
- **"Confusing" counts.** A step that works but the tester hesitated, misread Bangla
  copy, or couldn't find the control is a finding — UAT is about comprehension, not just
  function.
- **Bug log fields:** ID, journey step, role, device, language, severity
  (Blocker/Major/Minor/Cosmetic), expected, actual, screenshot, repro steps.
- **Entry criteria:** staging deploy green + migrations 0107–0113 applied.
- **Exit / sign-off:** 0 Blocker, 0 Major open; all Journeys marked Pass; product owner
  signs off per persona.

## 3. Acceptance journeys (end-to-end, by persona)

Each journey is a realistic task with a business outcome, not a feature checklist.
Acceptance = the persona reaches the outcome unaided, on a phone, in Bangla.

### School Owner (the core daily user)
- **SO-1 First morning:** log in → land on dashboard → understand today at a glance
  (KPIs, recent activity, quick actions) without training.
- **SO-2 Add a student & class:** enrol a new student, assign to a class/section; find
  them again via ⌘K/search.
- **SO-3 Take attendance:** mark a class's attendance; correct a mistake.
- **SO-4 Exam → result:** set up an exam, enter marks, view the result.
- **SO-5 Collect a fee:** record a fee payment for a student; see it reflected.
- **SO-6 Send SMS + top up:** compose an SMS to a class; when low, **buy an SMS
  package**; confirm balance rose and an invoice exists.
- **SO-7 Notifications:** receive + open a notification (e.g. subscription expiring),
  mark it read; open the inbox.
- **SO-8 Approve a request:** a leave/attendance-correction request appears in
  Approvals; approve it; confirm it clears.
- **Acceptance bar:** every SO journey completes in Bangla on a low-end phone, sidebar +
  search + notifications feel identical to other roles (one shell).

### School Staff (restricted)
- **ST-1 Granted vs blocked:** can do the screens they're granted (students/attendance/
  exams); **cannot** see/open ungranted screens or **buy SMS** (owner-only). The block is
  clear, not a crash.

### Distributor (runs a territory)
- **D-1 Onboard:** log in the first time → see standing → **read + accept the agreement**
  → status shows accepted.
- **D-2 CRM:** add a lead, move it across the pipeline (new→…→won), open its detail.
- **D-3 Onboarding tracker:** won leads + open tasks show up.
- **D-4 Wallet & commission:** view wallet balance/ledger; after Super Admin settles,
  see the "Settlement paid" / "Commission accrued" notification.
- **D-5 Invoice from company:** Super Admin bills the distributor (SMS credit) → the
  distributor **sees the invoice, records a payment, and prints it**.
- **Acceptance bar:** a distributor manages leads, money, and invoices without help;
  notifications keep them informed of approvals/settlements.

### Agent (field, phone-first)
- **A-1 My work:** log in → dashboard shows assigned tasks → open a task → **mark it
  done** → it moves out of "open". Everything one-thumb on a phone.

### Super Admin (platform owner)
- **S-1 Distributor lifecycle:** review a distributor's KYC → move status
  pending→under_review→approved; the distributor gets notified.
- **S-2 Agreements:** publish a new agreement version; confirm distributors must accept
  it; a version with acceptances can't be deleted.
- **S-3 Config the business (config-over-code):** change subscription pricing, a plan's
  features, a coupon, SMS package/rates, module/feature availability — **all from the
  UI, no code**.
- **S-4 Permissions:** grant/revoke a permission in the roles matrix; confirm the effect.
- **S-5 Money:** view invoices/payments, accounting trial balance, run a distributor
  **settlement** and approve/pay it; confirm GL + distributor notice.
- **S-6 Workflows:** create a workflow definition + stages; watch an instance appear in
  the approvals inbox; create a gov-official account.
- **S-7 Oversight:** audit log, job monitor, SMS commerce (school wallets) read clean.
- **Acceptance bar:** the owner runs pricing/commission/permissions/workflows entirely
  through admin screens.

### Gov Official (read oversight)
- **G-1:** log in → territory KPIs + schools list; search territory schools; **no write
  controls** anywhere.

## 4. Cross-cutting acceptance (every persona)

- **One portal feel:** same shell, nav, search, notifications, language toggle, profile,
  logout across all roles.
- **Bangla-first:** default Bangla reads naturally; no untranslated user-facing strings
  on the school/distributor/agent journeys (admin-config screens may stay English).
- **Phone usability:** 44px targets, mobile drawer, on-screen-keyboard doesn't hide the
  search/inputs, tables scroll.
- **Perceived speed:** skeletons on load (no blank waits); actions feel instant
  (optimistic toggles).
- **Print:** distributor invoice prints with no app chrome (sidebar/buttons hidden).
- **Accessibility:** reduced-motion honored; keyboard reaches nav/search; screen-reader
  announces toggles.
- **Error clarity:** a blocked/invalid action shows a plain-language message, never a raw
  DB error or a crash.
- **Security sanity (negative UAT):** a school user can't reach super-admin/distributor
  URLs (redirected home); staff can't buy SMS; a distributor sees only their own leads/
  invoices.

## 5. Regression focus (recently shipped — watch closely)
- dealer→distributor rename: no "dealer" wording, `/distributor` routes, distributor
  login lands correctly.
- Unified AppShell: all five role groups render it; gov has a shell for the first time.
- Distributor invoicing (new party model): **school invoicing still works unchanged**
  (issue a school invoice; subscription billing sweep unaffected).
- Search + notifications present for every role.

## 6. Deliverables
- Filled test-case sheet (Pass/Fail/Confusing per journey × device × language).
- Prioritized bug log.
- Per-persona sign-off + overall UAT sign-off before staging→main promotion.
