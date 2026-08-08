# UAT Checklist — runnable per-persona sheet (EdumeBD / Amar School)

Runnable acceptance sheet derived from [uat-plan.md](./uat-plan.md). One row per
journey step. Testers fill **Result** (Pass / Fail / Confusing), **Device**, **Lang**,
and attach a screenshot on Fail/Confusing. Automated coverage of the same paths lives
in `web/e2e/crud/**` + `web/e2e/cross/**` (map #329) — this sheet is the *human*
comprehension layer.

## How to fill
- Follow the **Goal**, not click-by-click. Record **Result**, **Device** (low-end
  Android / iPhone Safari / desktop Chrome), **Lang** (bn / en — run each journey once
  in each), **Severity** on failure (Blocker / Major / Minor / Cosmetic), and a repro note.
- "Confusing" is a finding even when the step technically works.
- Entry: staging green + migrations 0107–0113 applied. Exit: 0 Blocker / 0 Major open;
  every journey Pass; per-persona sign-off.

## Accounts (seed 0054/0066/0110 — throwaway)
| Role | Login | Password |
|---|---|---|
| Super Admin | demo.super@amarschool.test | DemoSuper#2026 |
| School Owner | demo.owner@amarschool.test | DemoOwner#2026 |
| School Staff | demo.staff@amarschool.test | DemoStaff#2026 |
| Distributor | demo.distributor@amarschool.test | DemoDist#2026 |
| Agent | demo.agent@amarschool.test | DemoAgent#2026 |

---

## School Owner
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| SO-1 | Log in → dashboard understandable at a glance (KPIs, recent activity, quick actions), no training | | | | |
| SO-2 | Enrol a new student + assign class/section; find them again via ⌘K/search | | | | |
| SO-3 | Mark a class's attendance; correct a mistake | | | | |
| SO-4 | Set up an exam, enter marks, view result | | | | |
| SO-5 | Record a fee payment for a student; see it reflected | | | | |
| SO-6 | Compose an SMS to a class; when low, buy an SMS package; confirm balance rose + invoice exists | | | | |
| SO-7 | Receive + open a notification (e.g. subscription expiring), mark read; open inbox | | | | |
| SO-8 | A request appears in Approvals; approve it; confirm it clears | | | | |

## School Staff
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| ST-1 | Do granted screens (students/attendance/exams); **cannot** open ungranted screens or **buy SMS** — block is clear, not a crash | | | | |

## Distributor
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| D-1 | First login → see standing → read + **accept the agreement** → status shows accepted | | | | |
| D-2 | Add a lead, move it across the pipeline (new→…→won), open its detail | | | | |
| D-3 | Won leads + open tasks show on the onboarding tracker | | | | |
| D-4 | View wallet balance/ledger; after a settlement, see the "Settlement paid" notice | | | | |
| D-5 | Company bills the distributor → see the invoice, record a payment, and **print** it (no app chrome) | | | | |

## Agent
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| A-1 | Log in → dashboard shows assigned tasks → open a task → **mark it done** → it leaves "open". One-thumb on a phone | | | | |

## Super Admin
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| S-1 | Review a distributor's KYC → status pending→under_review→approved; distributor gets notified | | | | |
| S-2 | Publish a new agreement version; distributors must accept it; a version with acceptances can't be deleted | | | | |
| S-3 | Change subscription pricing, a plan's features, a coupon, SMS package/rates, module/feature availability — all from the UI, no code | | | | |
| S-4 | Grant/revoke a permission in the roles matrix; confirm the effect | | | | |
| S-5 | View invoices/payments, trial balance, run a distributor settlement + approve/pay; confirm GL + distributor notice | | | | |
| S-6 | Create a workflow definition + stages; watch an instance in the approvals inbox; create a gov-official account | | | | |
| S-7 | Audit log, job monitor, SMS commerce (school wallets) read clean | | | | |

## Gov Official
| # | Goal | Result | Device | Lang | Note |
|---|---|---|---|---|---|
| G-1 | Log in → territory KPIs + schools list; search territory schools; **no write controls** anywhere | | | | |

---

## Cross-cutting (check on every persona)
| Aspect | Result | Note |
|---|---|---|
| One-portal feel (same shell/nav/search/notifications/lang/profile/logout) | | |
| Bangla-first: default bn reads naturally; no untranslated school/distributor/agent strings | | |
| Phone usability: 44px targets, mobile drawer, keyboard doesn't hide inputs, tables scroll | | |
| Perceived speed: skeletons on load, optimistic toggles | | |
| Print: distributor invoice prints with no app chrome | | |
| Accessibility: reduced-motion honored, keyboard reaches nav/search, SR announces toggles | | |
| Error clarity: blocked/invalid action shows plain language, never a raw DB error | | |
| Security (negative): school user can't reach super-admin/distributor URLs; staff can't buy SMS; distributor sees only own leads/invoices | | |

## Regression focus
| Item | Result | Note |
|---|---|---|
| dealer→distributor rename: no "dealer" wording, `/distributor` routes, correct landing | | |
| Unified AppShell on all five role groups (gov included) | | |
| Distributor invoicing (new party model) — school invoicing still works | | |
| Search + notifications present for every role | | |

## Known automated-suite gaps to verify manually (map #329)
- **Distributor lifecycle** `/super-admin/partners/[id]` — automated path is `test.fixme`: page currently throws the Next error boundary. **Verify manually whether it loads on staging.**
- **Settlement run→approve→pay** — automated `test.fixme` (needs accrued commissions + irreversible GL). Exercise S-5 by hand.
- **SMS send + package purchase** — automated `test.fixme` (wallet/gateway). Exercise SO-6 by hand.
- **School approval decide** — automated `test.fixme` (needs a seeded in-progress instance). Exercise SO-8 / S-6 by hand.
- **Deep per-field CRUD** for the 6 PRD modules (employees/classes/attendance/exams/fees) is render-smoke in automation — exercise full add/edit/delete by hand.
