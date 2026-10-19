# UX Audit — Amar School / EdumeBD LMS

Date: 2026-08-04 · Branch: `test/258-e2e-smoke` · Evidence: live Playwright screenshots (`web/e2e/ux-shots/`) + code review.

## Aligned requirements (via /grilling)

- **Scope:** whole product, separate **/10 per role** (School Owner, Staff, Super Admin, Dealer, Gov).
- **Bar:** non-tech school users on cheap Android in Bangla → **smooth, simple, useful journeys** dominate; aesthetics secondary. Punish confusing/inconsistent/inaccessible/untranslated, not "not flashy".
- **Weighting:** Usability/flow 30 · IA/nav 20 · Copy (bn-first) 15 · Visual consistency 15 · Accessibility 10 · Performance 10.
- **PRD fit:** each role annotated with master_prd coverage; a PRD-required journey that doesn't exist **caps** that role's usability (can't be "smooth" if absent).

## Scores

| Role | Score | One line |
|---|---|---|
| **School Owner** | **7.8 / 10** | Polished, consistent, bilingual, responsive — the product's strength. |
| **Staff User** | **7.4 / 10** | Same shell, permission-gated subset; clean, less surface. |
| **Super Admin** | **6.3 / 10** | Strong business dashboard, but most PRD config UIs unbuilt + an empty chart reads broken. |
| **Dealer (Distributor)** | **2.5 / 10** | Stub — one empty card; none of the PRD distributor journey exists. |
| **Gov Official** | **2.4 / 10** | Stub — identical empty card; no reports/observation views. |
| **Product (usage-weighted)** | **~6.5 / 10** | Excellent where built (school), unbuilt where the partner PRD lives. |

---

## School Owner — 7.8/10  (primary, non-tech user)

Screens: `owner-01-dashboard`, `owner-03-student-new`, `owner-05-fees`, `owner-08-dashboard-mobile`.

| Dimension | /10 | Notes |
|---|---|---|
| Usability/flow (30%) | 8 | Dashboard summary → quick actions (+Student/+Employee); fee table with per-row রসিদ (receipt); class/month filters; tabbed accounting. |
| IA/nav (20%) | 9 | Consistent icon sidebar, one shell every page, clear grouping; never lost. |
| Copy bn-first (15%) | 8 | Bangla throughout, plain labels, good empty states ("কোনো আসন্ন কার্যক্রম নেই"). |
| Visual consistency (15%) | 8 | Cohesive violet card system, even spacing, clean forms. |
| Accessibility (10%) | 6 | Visible focus ring + 44px touch targets present; **but no `prefers-reduced-motion`, some low-contrast light-violet-on-white + tiny secondary text**. |
| Performance (10%) | 6 | Only **1 `loading.tsx`** in the whole app → blank waits on slow networks (hurts the low-bandwidth user most). |

**Top findings**
1. Admission form is one long scroll (identity + address + …) — for non-tech users a **guided stepper** (map #184 planned it) would cut abandonment. 
2. **Date input shows `mm/dd/yyyy`** (US) in a Bangla app — localize to `dd/mm/yyyy`.
3. Add **skeletons/loading states** on list + dashboard fetches; blank flashes feel broken on 3G.
4. Add `prefers-reduced-motion` + audit contrast on muted text.

## Staff User — 7.4/10

Screen: `staff-01-dashboard`. Same shell + polish; modules filtered by grants (screen-level). A `permission-denied` screen exists (good). Scores track School Owner minus surface; no distinct usability problems, so the shell's a11y/perf gaps carry over.

## Super Admin — 6.3/10  (config-heavy PRD role)

Screens: `super-01-dashboard`, `super-03-partners`, `super-04-sms`, `super-05-locations`.

| Dimension | /10 | Notes |
|---|---|---|
| Usability/flow (30%) | 6 | Rich KPI dashboard (income, active/trial/expired donut, SMS pool). But partner admin is **create-account + assign-territory only**; most config journeys absent. |
| IA/nav (20%) | 7 | Clear sidebar (schools/dealers/codes/gov/territory/clusters/vendor-sms/holidays); PRD config areas simply missing. |
| Copy (15%) | 7 | Business Bangla reads well. |
| Visual (15%) | 6 | Dashboard polished, **but the revenue-trend chart renders empty axes (looks broken)**, and partner list shows raw test junk ("dsds", a UUID as a name) — no validation polish. |
| Accessibility (10%) | 6 | Shell-level, same gaps. |
| Performance (10%) | 6 | Same skeleton gap. |

**PRD coverage (caps usability):** master_prd's Super Admin owns distributors *with KYC*, agents, plans/pricing, **commission rules, settlements, feature flags per school, SMS provider/pricing, audit-log viewer, workflow config, agreement management** — the engines exist (migrations 0080–0106) but **have almost no admin UI**. Roughly **~30%** of the PRD Super-Admin surface is built.

**Top findings**
1. The empty revenue chart is the worst single impression — hide/placeholder it until there's data, or draw a flat baseline.
2. Build the **config screens the engines already back** (plans/pricing, commission rules, settlements, feature-flags-per-school, audit viewer) — highest leverage, data layer is done.
3. Partner create form needs validation + the KYC/agreement/status-lifecycle fields the schema now has.

## Dealer (Distributor) — 2.5/10 · Gov Official — 2.4/10  (stubs)

Screens: `dealer-01-landing`, `gov-01-landing`. **Both are a single centered card**: title + "welcome {email}" + "My Schools → no territory assigned yet". No sidebar, no data, no actions.

**PRD coverage:** distributor PRD demands CRM pipeline, onboarding tracker, **commission wallet, agreement acceptance (with IP/device), agent management, settlements, territory board** — the backend for most now exists (`distributor_profiles`, `leads`, `agent_assignments`, `commissions`, `settlements`, `accept_agreement`) but **zero of it is surfaced**. Gov has no reporting/observation UI at all.

Scores reflect: loads without error + a polite bilingual empty state (the only positives), but the PRD-required journeys are absent → usability capped near the floor. These aren't "bad UX", they're **unbuilt UX**.

---

## Cross-cutting (affects every role)

- **Perf/low-bandwidth (matters most for this audience):** 1 skeleton app-wide → add `loading.tsx` on list/dashboard routes.
- **Motion a11y:** no `prefers-reduced-motion` anywhere.
- **Contrast/typography:** muted light-violet + small secondary text is borderline on cheap screens in sunlight.
- **Strengths to preserve:** genuine bn-first (~1460 strings, Bangla default), one consistent shell, real empty states, 44px targets + visible focus, responsive mobile drawer.

## Highest-leverage fixes (ranked)

1. **Surface the built engines** as Super-Admin + Distributor screens (plans/pricing, commission/settlement, feature-flags, distributor CRM/wallet/agreement, audit viewer). Backend is done; this is the biggest score unlock (Super Admin 6→8, Dealer 2.5→7).
2. **Add loading skeletons** app-wide (perf weight × every role).
3. **Fix the empty super-admin revenue chart** + partner-form validation.
4. **Guided stepper** for student admission (+ other long forms) for non-tech users.
5. **Localize dates** + `prefers-reduced-motion` + contrast pass.

---

## UI Journeys (attempted task flows)

Each role's most-representative task, clicked through end-to-end (`npx playwright test e2e/ux-journeys.spec.ts`, shots `j-*`).

### School Owner — "Admit a student" ✅ smooth (journey score 8.5/10)
`j-owner-1-dashboard` → `-2-form` → `-3-filled` → `-4-result`.
1. Dashboard → persistent **"+ শিক্ষার্থী যোগ করুন"** CTA (always visible, bottom-left).
2. Sectioned form (পরিচিতি / ঠিকানা), Bangla labels.
3. Typed name only, submitted.
4. **Landed on the new student's profile** (সক্রিয় badge; actions: admission-form print, ID-card print, class/section transfer, archive, edit, photo upload).
- **Friction:** low — 3 clicks to a created record. **Findings:** created with just a name (all other fields show "—") → no required-field guardrails; a long single form vs a stepper; US date format. Fast, but thin validation.

### Super Admin — "Create a distributor" ✅ works, but shallow (journey score 5.5/10)
`j-super-1-partners` → `-2-filled` → `-3-result`.
1. Dealers page → **নতুন অ্যাকাউন্ট** (name / email / password).
2. Filled + submitted.
3. **"Journey Distributor" appears in the list** with an "assign territory" button.
- **Friction:** the create itself is fine, but this is the **entire** distributor lifecycle in the UI. **Findings:** no KYC (trade-license/NID/bank), no agreement step, no status (pending→approved), no commission/settlement view — all backed by tables now, none surfaced. The list still shows earlier junk ("dsds", a UUID name) → no validation.

### Staff User — "Open a non-granted screen" ✅ exemplary gating (journey score 8/10)
`j-staff-1-dashboard` → `-2-attendance-attempt`.
1. Login → **sidebar shows only Dashboard** (feature/permission gating collapses the nav — the #271 gating, live).
2. Navigating to `/school/attendance` → clean **"অনুমতি নেই / Permission Denied"** card: icon + "এই স্ক্রিনে আপনার অ্যাক্সেস নেই। স্কুল মালিকের সাথে যোগাযোগ করুন" + **"ড্যাশবোর্ডে ফিরুন"** button.
- **Friction:** none — the denial explains *why* and offers a way out (better than most SaaS). A newly-added staff with no grants sees an empty product until the owner grants screens (expected, but worth an onboarding hint).

### Dealer & Gov — dead-end (journey score 1.5/10)
`j-dealer-1-landing`, `j-gov-1-landing`.
1. Login → single card, "welcome {email}", "My Schools → no territory assigned yet".
2. **No controls. The journey ends.** Nothing to click, no nav, no next step.
- These aren't friction problems, they're **absent journeys** — the PRD's distributor CRM/wallet/agreement/agent flows and gov reporting don't exist in the UI.

---

_Screenshots: `web/e2e/ux-shots/` (28 shots: 17 static + 11 journey). Re-capture: `npx playwright test e2e/ux-audit.spec.ts e2e/ux-journeys.spec.ts`._
