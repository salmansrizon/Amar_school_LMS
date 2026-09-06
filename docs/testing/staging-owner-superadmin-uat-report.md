# Staging Owner and Super Admin UAT Report

> **Read [the corrections annex](#corrections-annex-2026-08-28) at the end of this file before
> acting on anything here.** This report is reliable about the symptoms it observed and
> unreliable about the causes it inferred. Six of its named causes — including two of the
> three release blockers — were wrong when checked at the source. The body below is the
> original text, kept intact on purpose: map #524 and its tickets cite it, and the record of
> what a UAT pass believed is worth keeping. Corrections live only in the annex.

## Test Conditions

- Environment: `https://staging.edumebd.com`
- Test date: 2026-08-28
- Owner persona: seeded school owner account
- Super Admin persona: seeded platform administrator account
- Student persona: seeded student account plus a new throwaway student created during UAT
- Languages: Bangla-first UI; English control checked on the tested mobile page
- Responsive check: 390x844 mobile viewport plus normal desktop viewport
- Safety: used throwaway data for admission and login provisioning; did not submit SMS sending, SMS purchase, financial purchase, or destructive delete actions

## Release Decision

**Do not release yet.** The shell and broad feature coverage are strong, but three blockers remain:

1. Super Admin location management renders no usable page, blocking territory and cluster administration.
2. Accounting reports a ledger imbalance of `৳2,800.00`; financial release is unsafe until reconciled.
3. Owner-to-student data workflows are not fully trustworthy because staging exposes duplicated records/options and owner outcome verification is incomplete.

## Owner Day-to-Day Simulation

### 1. Start the day

**Action:** Login and inspect dashboard.

**Result:** Pass. Dashboard shows school identity, welcome message, 27 students, 6 employees, attendance KPI, subscription status, checklist, upcoming exam, and quick actions.

**Main UX issue:** The dashboard contains many useful widgets but does not prioritize urgent work. A `0 / 5` checklist, approvals, subscription expiry, questions, and attendance exceptions should be ordered by urgency and linked to explicit next actions.

**Ideal workflow:** Dashboard opens with `today's priorities`, unresolved approvals, attendance status, expiring subscription, unanswered questions, and setup gaps. Each card should have one clear action and a completion state.

### 2. Admit a student

**Action:** Open new admission, complete minimal identity/class/guardian fields with throwaway values, save.

**Result:** Pass. Created `UAT Student 2026`; system assigned student number `S0028` and roll `5` in `Seven / Morning - A`. Detail page opened automatically.

**UX issues:** Form is long and flat. Required fields are not visually obvious in the rendered snapshot. No step grouping or progress indicator. Optional fields compete with admission-critical fields.

**Ideal workflow:** Use steps: identity, class placement, guardian, address, documents, review. Show required markers, inline validation, duplicate detection, a review summary, and a clear post-save checklist.

### 3. Provision student login

**Action:** On the new student's detail page, set a password and create login.

**Result:** Pass. Username generated as `s0028@adarshamodelschool.students.invalid`; one-time credential display appeared.

**UX/security issues:** One-time credential handling is easy to miss and relies on manual copy/print. It should clearly warn the operator that the password cannot be recovered from this screen. The student detail page also exposes many unrelated operational sections below the fold.

**Ideal workflow:** Show a dedicated `Issue login` confirmation with username, one-time password, copy/print/download actions, delivery method, and audit confirmation. Provide reset-password as a separate, clearly named action.

### 4. Verify student handoff

**Action:** Login as the newly provisioned student and inspect the student portal.

**Result:** Pass. Student reaches home and sees own name, student number, class, and roll. Three notices are visible.

**Finding:** Bangla profile page displays `father` for relationship while surrounding labels are Bangla.

**Ideal workflow:** Owner sees a handoff status: login issued, first login completed, last active time, and unresolved setup requirements. Localization should translate stored enum labels at render time.

### 5. Manage students

**Action:** Open student list, inspect filters/search/detail/archive/login routes.

**Result:** Partial pass. Search, class filter, list, detail, archive, login-management, and new-admission entry points render.

**UX issue:** List is dense and lacks visible bulk actions or a clear distinction between operational status, login status, and academic placement.

**Ideal workflow:** Search by name/roll/student number, filter by class/status/login state, select rows for safe bulk actions, preserve filters when returning from detail, and show audit history beside high-impact actions.

### 6. Manage employees and permissions

**Action:** Inspect employee list, employee setup, staff permissions.

**Result:** Partial pass. Employee list, grace rules, filters, staff creation, and permissions entry points render.

**Missing verification:** Could not safely complete staff creation and impersonated permission checks in this pass.

**Ideal workflow:** Create staff, assign class/subject reach, preview effective permissions, test as staff, then revoke access. Permission changes need before/after summary and audit event.

### 7. Configure classes and curriculum

**Action:** Inspect classes, class teacher selectors, routines, syllabus, subjects, assignment links.

**Result:** Partial pass. Controls and links render.

**Finding:** Several classes show `শিক্ষক নির্ধারিত নয়` / no assigned teacher, despite the product rule that each class should have a class teacher.

**Ideal workflow:** School setup cannot reach `ready` until every active class has teacher, subjects, section, and student roster. Dashboard should link directly to the missing assignment.

### 8. Take attendance

**Action:** Open attendance, inspect class/date filters, roster, present/absent radios, reason field, bulk controls.

**Result:** Partial pass. 27-student roster and controls render.

**UX issues:** Large roster is difficult on a phone. Bulk actions need confirmation, save state, and an obvious unsaved-changes indicator. The page must distinguish `not yet taken` from `all present`.

**Ideal workflow:** Choose class/date, show attendance status, mark bulk default, correct individual rows, require reason only for absence, save once, show timestamp/operator, allow controlled correction with audit trail.

### 9. Run exams and publish results

**Action:** Inspect exam list and entry points for details, marks, co-curricular items, seat plan, routine, documents, grading, and result inquiry.

**Result:** Partial pass. Feature entry points render.

**Missing verification:** Did not create or publish a new exam because it creates shared staging data and affects student visibility.

**Known student-side defect:** Student exam schedule previously showed repeated copies of one exam.

**Ideal workflow:** Configure exam, classes, subjects, schedule, seat plan, marks, review, publish, then verify exactly one canonical exam and result from a student account. Publish must show affected classes and irreversible visibility consequences.

### 10. Collect fees

**Action:** Inspect fee collection, fee structures, vouchers, bank/cash, ledger, and student fee records.

**Result:** Partial pass. Navigation and fee records render; class selection is required before student rows appear.

**Missing verification:** Did not submit a payment or receipt transaction.

**Ideal workflow:** Select month/class, show due/paid/adjusted balance, record payment method and reference, issue receipt, reflect payment in student statement, and reconcile against ledger. Every monetary action needs confirmation and duplicate-payment protection.

### 11. Send notices and questions

**Action:** Inspect publication list/create/view and question/request areas.

**Result:** Partial pass. Entry points render. Student can read published notices and ask questions.

**Ideal workflow:** Draft, preview audience, publish, notify, track read state, answer questions, and preserve author/reviewer timestamps. Owner should see unanswered questions on dashboard.

### 12. SMS operations

**Action:** Inspect SMS composer, recipient groups, balance, logs, absence rules, and purchase entry point.

**Result:** Partial pass. Controls render.

**Release blocker:** No real send or purchase was submitted. Super Admin dashboard shows SMS pool `-981`, which must never be presented as a usable balance.

**Ideal workflow:** Preview recipient count, segment count, price, remaining balance, and delivery policy before send. Block when balance is insufficient. Purchase requires separate confirmation and produces invoice plus wallet update.

### 13. Institute setup

**Action:** Inspect profile, print header, address, roll numbering, education levels, logo, and checklist.

**Result:** Partial pass. Controls render.

**Ideal workflow:** Guided setup with completion percentage, live print preview, image validation, and explicit save confirmation. Changes affecting documents need version/audit history.

## Super Admin Simulation

### Dashboard and school oversight

**Result:** Pass visually, unsafe data state.

Observed:

- `0 / 36` active schools while dashboard reports 28 trial and 8 expired.
- SMS pool `-981`.
- Recent activity contains repeated test tenants and repeated code-redemption events.

Recommendation: Separate production-like fixtures from UAT fixtures, label test data, and add dashboard invariants for impossible values such as negative inventory and inconsistent status totals.

### Schools

**Result:** Partial pass. School list, manage links, pagination, and create entry point render.

Recommendation: Add search/filter by status, plan, expiry, owner, distributor, and environment; show a warning before impersonating a school; preserve return context.

### Distributor, agreements, codes

**Result:** Pass for page availability. Distributor KYC/agreement, agreement versions, subscription-code generation, and acceptance controls render.

**Missing verification:** No new agreement, code batch, or distributor lifecycle transition submitted.

Recommendation: Use preview-before-publish, acceptance impact counts, immutable-version warnings, and a full audit trail.

### Locations and clusters

**Result:** Fail for locations.

Observed: `/super-admin/locations` shows the shared shell but no usable main content. `/super-admin/clusters` renders and depends on location context.

Impact: Territory, district, upazila, union, and cluster administration cannot be trusted. This blocks distributor and government oversight setup.

Recommendation: Fix locations route before release. Add empty, loading, error, and populated states; then test location creation through cluster assignment and school inclusion.

### Government officials and agents

**Result:** Pass for page availability. Lists and management entry points render.

Recommendation: Verify create, assignment, read-only boundaries, and notification after the locations blocker is fixed.

### Subscription, module, coupon configuration

**Result:** Pass for page availability. Pricing, plans, features, modules, and coupons expose configuration controls.

Recommendation: Add draft/publish semantics, impact preview, effective date, rollback, and confirmation showing affected tenants.

### Accounting and invoices

**Result:** Fail release gate.

Observed: accounting page explicitly reports `Ledger out of balance by ৳2,800.00.` Invoices list renders issued invoices.

Impact: Financial reports, settlements, and customer billing cannot be signed off.

Recommendation: Block settlement/payout while out of balance, identify the source transaction, expose reconciliation workflow, and add a zero-difference acceptance test.

### Settlement

**Result:** Page and `Approve & pay` controls render.

Recommendation: Require dual confirmation, show calculation inputs, lock the period after payment, and verify distributor notification and GL entries.

### Role permissions

**Result:** Page renders grant/revoke controls.

Recommendation: Never present grant/revoke as one-click for platform access. Show effective access diff, affected users, reason, and audit event; verify denial by logging in as the affected role.

### Audit log and job monitor

**Result:** Data renders.

Observed: job monitor contains many repeated `InvoiceGenerated` rows with `0` items and `queued` state.

Recommendation: Group jobs by run/correlation ID, show duration, retry count, error details, and completion state. Repeated zero-item jobs should be summarized, not flood the operator view.

### Workflows and notifications

**Result:** Pages and configuration controls render.

Recommendation: Test one complete definition-to-instance-to-approval path and one event-to-template-to-user delivery path. Every pending item needs owner, due date, escalation, and next action.

### SMS commerce

**Result:** Page renders segment rates, packages, save, add, deactivate, and delete controls.

Recommendation: Prevent negative balances, protect package deletion when referenced, and verify wallet, invoice, GL, and school visibility atomically.

### Security boundary

**Result:** Pass for tested direction. Super Admin visiting `/school` was redirected to `/super-admin`.

Remaining UAT: owner-to-super-admin, staff-to-owner, student-to-owner, and direct URL denial must be checked with separate active sessions.

## Main UI Problems

1. Empty pages do not explain whether data is absent, loading, unauthorized, or broken.
2. Long forms lack steps, required markers, review, and recovery guidance.
3. Dense tables are not optimized for phone-first daily operations.
4. High-risk actions lack consistent preview, confirmation, audit, and rollback patterns.
5. Bangla/English localization is incomplete for stored enum values and possibly unreliable on mobile.
6. Dashboard metrics allow contradictory or impossible states without warning.
7. Test data pollution makes real operational signals difficult to read.
8. Repeated rows/options indicate unscoped joins or missing identity-level deduplication.

## UAT Exit Gates Before Market Release

- Fix and regression-test duplicate student exam rows.
- Fix and regression-test duplicate subject options.
- Restore a usable Super Admin locations page.
- Reconcile accounting to exactly zero difference.
- Prevent negative SMS inventory and define insufficient-balance behavior.
- Complete one owner-created exam through student-visible result.
- Complete one owner notice through student read state.
- Complete one leave/correction request through owner approval and student status.
- Complete one fee payment through receipt, statement, and ledger verification.
- Complete one staff permission grant/revoke with real denial verification.
- Verify Bangla and English across desktop and 390x844 mobile, including reload persistence.
- Add populated and empty fixtures for every student journey.
- Run negative direct-URL tests for every role.
- Require zero Blocker and zero Major findings before staging-to-production promotion.

## Full-Throttle Operation Addendum

### Owner operations completed on staging

The following real UI operations were executed with throwaway or existing staging data:

- Created class `UAT Class`, branch `Morning UAT`, level `secondary`, group `Science`.
- Assigned `Fatema Begum` as class teacher during class creation.
- Created building `UAT Building`.
- Created room `UAT-101` with capacity `35`.
- Created employee `UAT Teacher 2026`, subject `Mathematics`, department `Science`.
- Assigned `UAT Teacher 2026` as Mathematics examiner for `Test Exam`.
- Added exam seat allocation for `UAT-101`, rolls `1–5`, 5 students.
- Verified seat-plan print page with building, room, capacity, student count, and roll range.
- Verified receipt print page with student, month, paid amount, discount, due, total, payment method, and date.
- Verified owner-to-student login provisioning and student login using the generated credential.

### Owner operations blocked or incomplete

- Employee creation does not create a staff login. A second staff-login creation step is required.
- New class had zero students, so student assignment and class-teacher question routing could not be verified end to end.
- Syllabus page has upload controls but no PDF fixture was available; student material visibility therefore remains unverified.
- Exam routine was not created. Routine print rendered a branded document with no rows.
- Exam attendance sheet explicitly said: `এই পরীক্ষার রুটিন এখনো তৈরি হয়নি — আগে রুটিন যোগ করুন।`
- Fee collection link opened a filtered fee page but no visible collection form appeared for the selected student. Payment, receipt generation from a new payment, and ledger reflection could not be completed.
- Financial settlement and `Approve & pay` were inspected but not submitted because they are irreversible financial actions.
- SMS send and SMS/package purchase were inspected but not submitted.
- Staff account creation and password entry require a separate final account-creation confirmation; therefore class-teacher login and subject-teacher login behavior remains unverified.

### Owner ideal daily workflow

1. Open dashboard and resolve urgent items in priority order.
2. Complete setup checklist: institute profile, buildings/rooms, classes, class teachers, subjects, staff logins, print branding.
3. Admit or import students; assign class, section, roll, subjects, and login.
4. Publish daily routine and learning material before the school day.
5. Mark attendance; record reasons; save; correct only through an audited correction flow.
6. Publish notices; confirm audience, read status, and follow-up questions.
7. Manage homework and student questions; route by class-teacher or subject-teacher responsibility.
8. Configure exam; assign subjects and examiners; create routine; assign rooms; generate seat plan; print documents.
9. Enter marks; review; publish results; verify from a student account.
10. Configure fee structure; collect payment; issue receipt; reconcile statement and ledger.
11. Review SMS balance and delivery logs; preview recipients/cost before sending.
12. Review approvals, unanswered questions, exceptions, audit events, and staff access before logout.

## Staff, Class Teacher, and Subject Teacher Scenarios

### School Staff

**Observed:** Staff dashboard loads with only allowed navigation for dashboard, attendance, and messages. Direct access to `/school/students` redirects to `/school/permission-denied` with a clear Bangla explanation.

**Pass:** Permission denial is understandable and not a crash.

**Missing:** A complete staff UAT needs a staff account with explicit grants for students, attendance, and exams, followed by revocation and re-login checks.

**Ideal:** Show effective permissions, scope (class/subject), expiry, and last change. Every blocked action should explain the owner contact and permitted alternatives.

### Class Teacher

**Expected workflow:** Owner assigns teacher to class; teacher sees only that class; teacher views roster, attendance, leave, questions, notices, and material; student question routes to that teacher; teacher replies; student sees answer.

**Status:** Owner-side class assignment works. Teacher login and question routing not proven because the newly created employee had no linked staff login.

**Gap:** The product currently separates employee creation, login creation, employee-to-login linking, and class assignment. This is operationally easy to miss.

**Ideal:** One guided `Create teacher` flow: employee profile, staff login, class assignment, subject assignment, permission preview, and test-access link.

### Subject Teacher

**Expected workflow:** Owner assigns teacher to a subject/exam or routine slot; subject teacher sees relevant classes and anchored questions/material; teacher replies only within that scope.

**Status:** Exam examiner assignment works for Mathematics. Routine-slot subject-teacher assignment and anchored student question reply were not proven.

**Ideal:** Make teacher scope explicit on the teacher dashboard. Every question should show why the teacher can answer: class assignment, subject assignment, or publication anchor.

## Student Full-Day Scenarios

### Morning

Student login, identity, class, roll, upcoming activity, and notices work. New student saw 3 notices and a homework task.

**Gap:** Routine and study-material pages can be empty without a direct explanation of what the student should do next.

### During class

Student can open notices, tasks, materials, exams, attendance, fees, questions, and profile. Student can mark own homework complete.

**Gap:** Subject selector duplication previously made question context unreliable. New student with no assigned subjects correctly sees no subject options, but the UI needs a better setup explanation.

### After class

Student can ask a question and view answers, request leave, request profile correction, and inspect attendance.

**Gap:** Leave empty-form validation is not visibly instructional. Student has no clear escalation or response-time promise for pending requests.

### Exam day

Seat-plan print works for the owner. Student exam page works when an exam is visible, but previously displayed duplicate exam entries for another seeded student. Admit-card and seat information need one canonical record and a student verification test.

### Fee day

Owner receipt display works for an existing payment. New collection path does not expose the expected form after clicking `আদায় করুন`.

**Release impact:** A school cannot rely on the portal for the central fee-collection workflow until this is fixed and verified through statement, receipt, and ledger.

## Super Admin Stress Scenarios

### Platform operations

All major Super Admin routes were opened: schools, distributors, agreements, codes, government officials, agents, locations, clusters, SMS, off-days, subscription configuration, modules, coupons, settlements, accounting, permissions, audit log, job monitor, workflows, notifications, SMS commerce, and invoices.

### Confirmed failures and risks

- `/super-admin/locations` renders the shell but no usable main content.
- `/super-admin/accounting` reports `Ledger out of balance by ৳2,800.00.`
- `/super-admin` reports SMS pool `-981` and says the pool is empty.
- Job monitor is flooded with repeated `InvoiceGenerated`, `0`, `queued` rows.
- Recent activity and school lists contain substantial repeated `ZZ` test data, obscuring operational signals.
- Several configuration pages mix Bangla and English labels, weakening Bangla-first operation.

### Ideal Super Admin workflow

1. Review health dashboard; impossible metrics must be hard errors, not ordinary KPI cards.
2. Fix platform configuration and locations before onboarding distributors or government officials.
3. Create/approve school and distributor; assign territory; verify notification and audit event.
4. Publish pricing/module/coupon changes with effective date, impact preview, and rollback.
5. Monitor jobs grouped by correlation ID; resolve failures before settlement.
6. Reconcile accounting to zero difference; only then approve settlement or invoice payment.
7. Verify school wallet/invoice/GL consistency after SMS commerce.
8. Review permission changes and test affected role access.

## Final Market-Readiness Recommendation

The product has broad feature coverage and several working vertical slices, but it is not yet ready for market release.

**Must fix before release:**

- Fee collection form and end-to-end receipt/ledger workflow.
- Super Admin locations page.
- Accounting imbalance and negative SMS balance.
- Exam routine creation-to-print and exam attendance sheet workflow.
- Duplicate exam and subject records/options.
- One-step teacher onboarding with login, class scope, subject scope, and permission verification.
- Bangla/English localization for stored values such as `father`.
- Clear loading, empty, error, and unauthorized states on every route.
- Clean or clearly segregate UAT data from operational data.

**Release acceptance bar:** every persona completes one realistic day without support; all high-risk workflows have preview/confirmation/audit; zero Blocker and Major findings; accounting balance is zero; student and owner see the same published exam, notice, routine, material, attendance, result, and fee state.

## Market-Grade UI and UX Review

### Product design principles

The product should feel like a calm school-office assistant, not an administration database. Keep powerful features, but expose them progressively:

- One primary action per page and one clear next step after every save.
- Plain Bangla by default; English switch must be complete and persistent.
- Use familiar labels such as `Save`, `Publish`, `Collect`, `Print`, and `Back` consistently.
- Hide advanced settings behind `More options`; do not remove access, only reduce first-glance load.
- Never make users remember IDs, URLs, class codes, or previous navigation state.
- Preserve entered data, filters, and scroll position after validation errors or returning from detail.
- Treat empty, loading, error, unauthorized, and success states as designed screens, not exceptions.
- Use the same shell, spacing, controls, confirmations, toast behavior, and keyboard rules across all personas.

### Scenario UX analysis

#### Scenario A: teacher uses a phone between classes

**Observed risk:** Attendance and student tables are dense. On mobile, navigation moves into a drawer and the main table remains information-heavy.

**Break condition:** Teacher cannot identify the current class/date, save status, or next student with one hand; horizontal table movement hides names or actions.

**Ideal solution:** Use a mobile student-card layout with name, roll, current status, and one large toggle. Keep class/date as sticky controls. Show `Saved at 10:42 by Karim Mia` and an unsaved-changes warning. Keep bulk actions at the bottom within thumb reach.

**Acceptance:** 44px minimum targets, no accidental drawer closure, no hidden save button behind keyboard, and attendance completed for 30 students in under two minutes.

#### Scenario B: owner admits a student during a busy office hour

**Observed risk:** Admission is a long flat form with many optional fields competing with required identity, placement, and guardian fields.

**Break condition:** Owner submits incomplete data, loses the form after an error, or cannot tell whether the student was saved.

**Ideal solution:** Four-step wizard with progress: `Student`, `Placement`, `Guardian`, `Review`. Mark required fields visibly, validate inline, flag likely duplicate names/guardian phones, autosave a draft, and show a post-save checklist for subjects, login, and documents.

**Acceptance:** A non-technical owner completes a valid admission without help; invalid mobile/date/roll values explain the fix in Bangla.

#### Scenario C: owner creates class and teacher together

**Observed risk:** Class creation, employee creation, staff login, class-teacher assignment, and subject/exam assignment are separate surfaces.

**Break condition:** Class exists with no teacher, teacher exists with no login, or login exists without scope.

**Ideal solution:** `Set up class` workflow: create class, choose teacher, create/link login, assign subjects, preview effective reach, and finish with a readiness checklist. Allow later edits without hiding which downstream features are affected.

**Acceptance:** Active class cannot silently remain without a teacher. Owner sees exactly what the teacher can read/write before confirming.

#### Scenario D: owner publishes an exam

**Observed risk:** Exam setup exposes many independent entry points. Routine print rendered successfully but had no rows because routine creation was incomplete; attendance sheet correctly blocked with a prerequisite message.

**Break condition:** Owner believes exam is ready while schedule, room, examiner, seat plan, marks, or publication is missing.

**Ideal solution:** Exam readiness checklist with hard gates: subjects, examiners, dates/times, rooms, seat plan, attendance sheet, marks entry, review, publish. Show missing items on one page and link each to its fix. Preview student view before publish.

**Acceptance:** Publish disabled until required items pass; student sees one canonical exam, one room, one time, and one admit card.

#### Scenario E: office collects a fee and prints proof

**Observed risk:** `আদায় করুন` navigated to a filtered page without a visible collection form. Existing receipt print works, but the new payment path was not reachable.

**Break condition:** Cash is accepted without a receipt, duplicate payment is possible, or owner cannot see ledger impact.

**Ideal solution:** Single collection drawer/page with student identity, month, due, discount, received amount, method, reference, note, and resulting balance. Preview receipt before confirm. After save, show receipt, statement, ledger posting, and print/download actions together.

**Acceptance:** One payment produces exactly one receipt and balanced ledger entry; refresh/back cannot duplicate it.

#### Scenario F: student asks for clarification

**Observed risk:** Subject options previously repeated identical values; a new student with no assigned subject saw an empty selector with little setup context.

**Break condition:** Student sends question to wrong teacher or cannot tell why no subject is available.

**Ideal solution:** Subject options must be unique and human-readable. Show teacher name and scope, e.g. `Mathematics · UAT Teacher 2026`. When empty, explain `Your school has not assigned a subject yet` and provide a safe general-question route.

**Acceptance:** Question shows recipient, scope, timestamp, pending state, reply, and escalation path. Student never sees duplicate choices.

#### Scenario G: distributor manages a territory

**Observed risk:** Super Admin locations page rendered no usable main content, while clusters depended on location context.

**Break condition:** Distributor, agent, school, or government official cannot be assigned to a trusted territory hierarchy.

**Ideal solution:** Guided hierarchy `Division → District → Upazila → Union → Cluster → School`. Show ownership, assignment history, effective dates, conflicts, and audit events. Prevent orphaned entities and duplicate names without context.

**Acceptance:** Super Admin creates one location, assigns distributor and school, sees the same hierarchy in every affected portal, and can trace every reassignment.

#### Scenario H: Super Admin handles money

**Observed risk:** Accounting reported `Ledger out of balance by ৳2,800.00`; dashboard showed SMS pool `-981`.

**Break condition:** Super Admin approves settlement or sells SMS while source balances are impossible or unreconciled.

**Ideal solution:** Health banner with severity and blocking state. Disable settlement/payment when balance is not zero. Show source transactions, reconciliation action, period lock, and audit trail. Never render negative inventory as ordinary KPI.

**Acceptance:** No financial transition can complete while invariants fail; every invoice, payment, wallet, commission, and GL entry has one correlation ID.

#### Scenario I: user works on slow network

**Observed risk:** Browser console recorded an RSC fetch failure followed by browser-navigation fallback while loading the school portal.

**Break condition:** User sees a blank page, duplicate submission, stale data, or does not know whether save succeeded.

**Ideal solution:** Server-render critical shell and page title immediately. Show skeletons for data regions, disable only the active action during submit, use idempotency keys for writes, retry safe reads, and show offline/slow-network status. Never hide a failed request behind a silent fallback.

**Acceptance:** On throttled 3G, first meaningful shell appears quickly, actions have visible progress, retry preserves form state, and refresh never duplicates a write.

#### Scenario J: user changes language or theme

**Observed risk:** Mobile English switch did not visibly change the tested owner attendance page; stored relationship value `father` remained untranslated in a Bangla student profile.

**Break condition:** Mixed languages make labels, permissions, and records hard to understand.

**Ideal solution:** Central translation keys for all labels and enum values, locale-aware date/number/currency formatting, selected-state indication, persistence after reload, and a fallback audit that flags untranslated strings.

**Acceptance:** Every route passes Bangla and English snapshots; no raw enum, developer key, or mixed-language label appears in user-facing content.

## Production UI Best-Practice Checklist

### Navigation and information architecture

- Use role-specific navigation with visible active state and count badges only when actionable.
- Add breadcrumbs on deep pages and preserve the originating filter/context.
- Keep global search scoped by role and tenant; show result type and permission reason.
- Add `Recently used` and `Needs attention` instead of exposing every advanced route at equal weight.
- Provide a consistent page header: title, context, status, primary action, secondary actions.

### Forms and data entry

- Labels always visible; placeholders never substitute for labels.
- Required fields marked before submit; errors adjacent to fields plus a summary at top.
- Use date pickers with typed-input fallback and timezone-safe display.
- Validate cross-field rules such as end date after start date and payment not above due without adjustment reason.
- Use draft/recovery for long forms and warn before leaving unsaved data.
- Confirm high-impact operations with a summary of actor, target, amount, audience, and consequence.

### Tables and dashboards

- Desktop tables: sticky header, useful column priority, sort/filter/search, pagination, export/print.
- Mobile tables: cards or priority columns; never require repeated horizontal scrolling for core actions.
- Show data freshness and last updated time for KPIs.
- Explain every zero, blank, negative, and unavailable value.
- Add empty-state action, not only empty-state prose.
- Avoid duplicate rows at query and presentation layers; add identity-level uniqueness tests.

### Feedback and resilience

- Immediate success confirmation includes what changed and where it can be found.
- Mutating buttons use pending state and become idempotent.
- Errors show human explanation, retry, support reference, and no raw database text.
- Destructive actions use typed or explicit confirmation and explain dependencies.
- Preserve state on network failure, refresh, back, and session renewal.
- Use skeletons for predictable content and avoid layout shift.

### Accessibility and inclusion

- Keyboard navigation for desktop; visible focus; logical tab order; skip link.
- Screen-reader labels for icon-only controls, status changes, dialogs, and validation errors.
- 44px touch targets, sufficient contrast, reduced-motion support, and zoom-safe layout.
- Bangla typography must remain readable at larger text sizes.
- Do not encode meaning by color alone; pair status colors with text/icons.

## Performance and Security Release Gates

### Performance

- Measure Core Web Vitals on desktop and low-end Android: LCP, INP, CLS, TTFB.
- Set budgets per route; fail CI when portal shell or critical dashboard regresses.
- Server-render or stream critical content; lazy-load charts, print previews, galleries, and advanced admin panels.
- Paginate large school/student/audit/job lists server-side; avoid rendering hundreds of rows at once.
- Cache safe reference data such as subjects, locations, and feature definitions with explicit invalidation.
- Deduplicate parallel requests and prevent repeated client fetches after navigation.
- Compress images, validate upload size/type server-side, and avoid loading unused media.
- Add synthetic checks for login, dashboard, attendance, fee collection, exam publish, and student notice load.

### Security and tenant isolation

- Enforce role and school/distributor scope server-side on every read and write; UI hiding is not authorization.
- Verify Supabase RLS policies with cross-school and cross-distributor negative tests.
- Use secure, HttpOnly, SameSite cookies; short session lifetime with safe refresh and logout invalidation.
- Add CSRF protection where cookie-authenticated mutations are possible and validate all server actions.
- Apply rate limits to login, password reset, student-login provisioning, SMS, uploads, and financial endpoints.
- Never expose service-role keys, secrets, raw database errors, or one-time credentials in logs or URLs.
- Scan uploaded files, restrict MIME types, store outside executable paths, and use signed short-lived download URLs.
- Use CSP, frame-ancestors protection, HSTS, secure headers, and clickjacking protection.
- Log actor, tenant, role, target, before/after, correlation ID, IP/device metadata policy, and timestamp for sensitive changes.
- Make financial, permission, subscription, settlement, and publication events immutable or reversibly versioned.
- Add anomaly alerts for negative balances, impossible status totals, repeated job retries, duplicate invoice IDs, and cross-tenant access attempts.

## Distribution-Business Operating Model

The Super Admin should manage the business through a transparent lifecycle rather than disconnected CRUD screens:

1. Configure territory and ownership hierarchy.
2. Onboard distributor; verify KYC; publish/accept agreement version.
3. Assign agents, schools, clusters, and operational tasks with effective dates.
4. Track school onboarding, subscription, modules, SMS wallet, invoices, and support state.
5. Calculate commission from immutable events and show the formula to the distributor.
6. Reconcile invoices, payments, wallet movements, commission, and GL before settlement.
7. Approve and pay settlement only when health checks pass.
8. Notify every affected entity and expose the same status in its portal.
9. Preserve audit history and provide exportable evidence for disputes.

Each lifecycle screen should answer: `Who owns this?`, `What is its current state?`, `What can I do next?`, `What will change?`, `Who approved it?`, and `Where is the evidence?`

## Final UX Sign-off Criteria

- A non-technical school owner completes admission, class setup, teacher assignment, attendance, notice, exam, room, print, fee, and correction workflows without training.
- A teacher completes attendance, sees only assigned scope, receives student questions, publishes material, and manages tasks from mobile.
- A student finds today's routine, notices, material, homework, exam, attendance, fees, and help path without guessing.
- A distributor can understand territory, schools, tasks, invoices, wallet, commission, and settlement status without support.
- A Super Admin can trace every business transition from source event to notification and ledger entry.
- No critical route has silent blank states, mixed localization, impossible metrics, duplicate identities, or raw technical errors.
- Performance budgets, RLS tests, security headers, audit checks, and negative authorization tests pass in CI and staging.

## Access-Control UAT and Best Practices

### Access model

Access must be evaluated on four independent axes. A user may see a screen but still have no write authority, or may have a staff grant but no class attachment.

| Actor | Portal scope | Data scope | Typical authority | Must not have |
|---|---|---|---|---|
| Super Admin | Platform-wide | All schools and business entities | Configure, oversee, reconcile, audit | Uncontrolled student-level operational access without an explicit audited reason |
| School Owner | One school | Entire own school | Full school administration, finance, staff, academic setup | Other schools, distributor platform controls |
| Staff User | One school | Only granted screens plus permitted school rows | The exact modules/actions granted by owner | Student, fee, SMS, or admin data outside the grant |
| Class Teacher | One school | Assigned class and its students | Class attendance, notices, materials, questions, leave workflow | Other classes and school-wide controls unless separately granted |
| Subject Teacher | One school | Assigned subject/routine/class context | Subject materials, class notices, and relevant student questions | Unassigned subjects, leave/correction decisions, unrelated student records |
| Student | One school | Own profile, own learning and requests | Read own learning data; create own question/leave/correction/task actions | Any other student, school configuration, or approval action |
| Distributor | Assigned territory | Assigned schools/leads/invoices | Territory onboarding and commercial workflow | Other distributors' entities or school operational records |
| Agent | Assigned work scope | Assigned schools/tasks | Work assigned by distributor/platform | Territory-wide or unassigned school administration |
| Gov Official | Assigned territory | Read-only oversight data | View permitted reports | Any mutation, finance settlement, or student editing |

The implementation must enforce `screen grant + row/tenant scope + class/subject attachment + action permission`. Navigation visibility is only a usability layer; it is never authorization.

### Scenario-based access tests

| Scenario | Expected workflow | Failure condition | Release requirement |
|---|---|---|---|
| Owner grants staff attendance only | Owner selects Staff > Attendance > read/write, reviews scope, confirms, and sees an audit entry | Staff sees students, fees, SMS, or settings; direct URL opens forbidden data | Deny at navigation, page loader, server action/API, and RLS |
| Staff has no class attachment | Staff can use the explicitly granted operational screen but receives an explanatory empty state where class attachment is required | Blank page, guessed scope, or accidental whole-school student access | Show `No class assigned` and an owner contact path |
| Class Teacher owns Class A | Teacher sees and manages Class A students, attendance, questions, notices, and leave context | Class B appears in selectors, counts, exports, or deep links | Filter every query and mutation by active class attachment |
| Class Teacher attempts Class B | Teacher receives a clear forbidden response and no record metadata leaks | UI hides Class B but `/id`, export, or server action returns it | Add cross-class negative tests for every relevant endpoint |
| Subject Teacher teaches Mathematics in Class A | Teacher can see and answer Mathematics questions anchored to the assigned class/subject and publish allowed material | Teacher can answer another subject, approve leave, or edit profile corrections | Permission decision must explain the matching assignment |
| Subject Teacher opens an unassigned subject | The question list is empty with `No assigned subject` rather than a generic error | Unrelated questions or reply action is available | Enforce subject attachment server-side |
| One employee is both class and subject teacher | Effective access is the union of the two valid assignments, displayed separately | Broad class-teacher access silently leaks into every school subject | Show each effective grant and its source |
| Student opens own records | Student sees own routine, notices, materials, exams, fees, attendance, tasks, questions, and requests | Student can change school-owned rows or query another student by ID | Own-row RLS plus action-specific server checks |
| Student opens another student URL | Request is denied without revealing whether the record exists | Detail, invoice, result, or attachment is returned | Test guessed IDs, copied links, exports, and stale browser tabs |
| Owner changes a staff grant | Owner reviews before/after permissions, confirms, and the staff session loses access promptly | Revoked access remains usable through an open tab or cached response | Invalidate session/permission cache and audit the change |
| Suspended or expired school | Suspended school is blocked; expired-school behavior follows the documented read/write policy | Subscription state is treated as the sole authorization mechanism | Keep subscription, authentication, and authorization separate |
| Owner enters another tenant URL | Owner remains within the authenticated school tenant | Client-supplied school ID changes returned data | Derive tenant from the authenticated session, never the request body |
| Super Admin uses school operations | Super Admin uses an explicit audited support/impersonation path when needed | Platform access silently becomes an ordinary owner session | Banner, reason, time limit, target school, and complete audit trail |
| Distributor/agent opens an unassigned school | Access is denied or the item is absent from lists | Other territory entities, invoices, or leads are visible by ID | Territory scope enforced in every query and mutation |
| Gov Official attempts a write | Read-only explanation is shown | Any approval, edit, export with sensitive fields, or settlement action succeeds | Server-side deny and audit attempted mutation |

### Owner permission workflow

The current product should make the owner workflow explicit and reversible:

1. Open `People and Access`, choose the staff member, and show current effective access.
2. Select `Screen access` separately from `Class/subject reach` and `Action authority`.
3. Preview the exact pages, records, and actions the staff member will receive.
4. Show sensitive-data impact, affected classes, expiry date, and the permission change reason.
5. Confirm with a concise before/after summary.
6. Show success, audit reference, and a `Test as this user` option with a persistent impersonation banner.
7. Provide one-click revoke, with session invalidation and visible effective-access refresh.

Avoid a single overloaded `Role` dropdown. Use labels such as `Screen access`, `Class reach`, `Subject assignment`, `Can view`, `Can manage`, and `Read only`.

### UI requirements for non-technical users

- Use role-aware navigation, but retain a clear permission-denied page for deep links; never produce a silent blank screen.
- Add badges: `Owner`, `Class Teacher · Seven`, `Subject Teacher · Mathematics · Nine`, `Read only`, and `Extended access`.
- On every restricted list, explain why the record is visible or unavailable and who can grant access.
- In the student question flow, show `Assigned to Mathematics teacher` or `Handled by class teacher`; do not expose unrelated teacher queues.
- In staff access setup, show a plain-language preview: `Can mark attendance for Class Seven` and `Cannot view fees`.
- Use Bangla labels consistently, preserve readable English names where required, and avoid raw role codes or database errors.
- Keep permission controls keyboard accessible, labelled, high contrast, and at least 44px on mobile. Require an explicit confirmation for access expansion and revocation.
- After a denied deep link, preserve the intended destination and offer `Back to my dashboard` and `Contact school owner`.

### Security requirements

- Deny unknown route segments by default; do not rely on a client route guard or hidden menu item.
- Apply tenant, role, class, subject, and action checks to every server action, API route, download, export, print view, and background job.
- Use RLS policies as the final data boundary. Test read, insert, update, delete, export, and attachment access for every actor above.
- Never trust a client-provided school ID, class ID, subject ID, role, or permission flag. Resolve authority from authenticated server state.
- Minimize sensitive fields: office staff and subject teachers should not receive unrelated guardian NID, phone, sibling, financial, or private correction data.
- Use secure HttpOnly SameSite cookies, CSRF protection for cookie mutations, rate limits on login/provisioning/SMS/financial actions, signed short-lived file URLs, CSP, HSTS, and frame protection.
- Audit actor, tenant, effective role, target, action, before/after, reason, correlation ID, timestamp, and impersonation context for permissions, finance, publication, subscription, and settlement events.
- Revoke active sessions or permission caches after access changes. Recheck authorization inside long-running jobs so a revoked user cannot complete a queued mutation.

### Access-control release gates

Release is blocked until all of the following pass in staging:

- Each role sees only its intended navigation and receives a useful explanation for denied screens.
- Cross-school, cross-class, cross-subject, cross-distributor, and cross-student deep-link tests fail safely.
- Direct API, server-action, download, print, export, and queued-job authorization matches the UI decision.
- Owner grant, attachment, revoke, and impersonation flows produce complete audit evidence.
- A staff member can be provisioned with attendance-only access without gaining student management, fees, SMS, finance, or settings.
- Class Teacher and Subject Teacher scopes remain distinct, including the combined-role case.
- Student self-service works while all school-owned records remain immutable to the student.
- Sensitive fields are minimized by role, and permission changes invalidate stale sessions/caches.
- RLS and authorization tests pass in CI with both positive and negative cases; no critical access finding remains open.

## Intensive Simulation Pass 2

**Execution date:** 28 Aug 2026  
**Method:** integrated-browser staging crawl, real persona logins, deep-link negatives, responsive inspection, safe workflow submissions, network/header inspection, and repository route inventory.  
**Coverage:** 173 page/route files were inventoried in `web/app`; all major static surfaces were opened for Owner, Staff, Class Teacher, Student, Distributor, Agent, Gov Official, and Super Admin. Dynamic details were opened where staging exposed a real record.

### Verified results by persona

#### School Owner

- The main school dashboard, student, employee, class, attendance, exam, fee, SMS, publication, institute, staff, and notification surfaces render with a `main` region and usable headings in normal conditions.
- `/school/classes/routine/print` resolves to a page-not-found state. A routine exists as a product feature, so the owner cannot complete the expected `build routine -> print routine` workflow from this route.
- `/school/exams/mark-sheet-preview` took approximately 31 seconds to become usable during a cold navigation. This is not acceptable for a time-sensitive result-printing workflow.
- Rapid navigation produced `ERR_ABORTED`/RSC fallback behavior before settling. The page eventually rendered, but navigation must not depend on browser fallback after an avoidable failed RSC request.
- The fee collection entry point still navigates to `#collect-form` without presenting a visible collection form. This remains a P1 operational blocker.
- Exam document routes render controls, but an exam routine without schedule rows produces a branded blank/partial print. The user needs a preflight error explaining exactly which subject/date/room data is missing.
- Existing receipt and seat-plan print views render cleanly enough for basic office printing.

#### School Staff

- The staff drawer exposes dashboard, attendance, and messages only.
- Direct navigation to students, employees, classes, exams, fees, SMS, notices, staff permissions, and institute routes redirects to the localized permission-denied page. This is a verified positive UI boundary.
- The boundary still needs API/RLS proof for every equivalent read, write, print, export, and download action; the current browser evidence proves the page-level boundary only.

#### Class Teacher

- The dashboard correctly states `আমার শ্রেণি · 1` and identifies one assigned class.
- `/school/students` returned 82 rows including `Class 1 / A`, `Class 1 / B`, `Class 2 / A`, `Class 2 / B`, many unrelated E2E classes, and the teacher's own class. This directly contradicts the intended class attachment scope.
- Opening an unrelated student's detail page exposed `Archive`, subject assignment, and behaviour-log controls. A class teacher must not be able to archive, reassign, or add behaviour records for another class.
- `/school/classes` was also reachable and exposed destructive subject/class controls. A class teacher should not receive school catalogue deletion authority merely because they need to teach their assigned class.
- `/school/questions` and `/school/corrections` showed the intended student-facing queues for the assigned class, but the unrelated-student leak makes all student-facing reads untrustworthy until the same scope is enforced in every query.

**Severity:** P0 security and data-integrity blocker. Fix server-side scope first, then reduce the navigation and action surface. Do not ship a class-teacher account while this is reproducible.

#### Student

- All student static routes rendered: home, routine, notices, tasks, materials, results, exams, attendance, leave, fees, questions, profile, and notifications.
- A real student submitted a question from a seeded homework detail; the page confirmed `প্রশ্ন পাঠানো হয়েছে` and the question appeared in the question list.
- A reversed leave date was rejected with a clear Bengali validation message. A valid throwaway leave request was accepted and displayed as pending.
- A seeded homework detail provides the expected text question and file-submission entry point. File submission was opened and cancelled without uploading a fixture.
- Student deep links to `/school` and `/super-admin` returned the student home rather than another portal. This is a verified positive boundary.
- The question subject selector contains repeated identical `XS1 Physics` options. The profile request history contains repeated requests for the same value. These are data/query deduplication defects, not merely visual noise.
- The student experience has no visible “subject teacher unavailable / class teacher fallback” explanation when a subject assignment is absent. Add a human fallback path.

#### Distributor

- Dashboard, CRM, onboarding, wallet, invoice list, invoice detail, notifications, and cross-role redirects rendered.
- The distributor invoice detail provides `Record payment` and `Print`; payment was not submitted because it is a financial mutation requiring a separate action-time confirmation.
- CRM detail displays the stage vocabulary (`new`, `contacted`, `demo`, `negotiation`, `won`, `lost`) but exposed no form or actionable stage transition control. A distributor can inspect the lead but cannot complete the expected pipeline operation from the detail page.
- The onboarding/wallet/invoice views are operationally sparse. Empty states need next actions, not only counts or “no data” prose.

#### Agent

- Dashboard, task list, and task detail rendered.
- A real open task was marked done; the page changed to `done` and exposed `Reopen task`. This is a verified successful mutation.
- Agent deep links to school and super-admin routes returned the agent home.
- Task detail is very minimal. Add linked school, contact, task owner, due-date status, evidence upload, and completion note before treating it as a production field-operations workflow.

#### Gov Official

- Gov dashboard rendered as read-only with zero assigned territory and a clear no-territory state.
- Gov deep links to school, super-admin, distributor, and agent routes returned the gov home.
- Territory assignment and read-only report access could not be fully validated because the staging account has no territory. Seed one non-production territory assignment for a complete positive/negative UAT pair.

#### Super Admin

- Dashboard, schools, partners, agreements, subscription codes, gov officials, agents, locations, clusters, vendor SMS, central off-days, subscription config, modules/features, coupons, settlements, accounting, permissions, audit log, job monitor, workflows, notification templates, SMS commerce, invoices, and upcoming renewals all rendered after isolated navigation.
- The location tree contains a very large dataset rendered in one page. It includes repeated/near-duplicate names such as `Gournadi/Gaurnadi`, `Kaukhali/Kawkhali`, and staging test nodes. Use server pagination/search or a virtualized tree and add canonical uniqueness rules.
- Dashboard showed SMS pool `-981`; this is an impossible inventory state and must block allocation and settlement workflows.
- Accounting showed `Ledger out of balance by ৳2,800.00.` This must block financial release and settlement approval, with an actionable reconciliation link.
- Job monitor showed repeated `InvoiceGenerated`, `0`, and `queued` records. Add job identity, attempt count, last error, next retry, and deduplication; do not present repeated rows as independent business events.
- Recent activity and school data contain `ZZ`/test records. Staging cleanup and production seed hygiene are required before screenshots, demos, or customer onboarding.
- A school route visited under Super Admin did not open ordinary school operations. Keep this boundary, but provide an explicit audited support/impersonation path when cross-tenant support is required.

### Security and platform evidence

- Staging sends `Strict-Transport-Security: max-age=63072000` and private no-store cache headers on authenticated pages. This is good baseline behavior.
- The authenticated response did not expose a Content-Security-Policy or X-Frame-Options/`frame-ancestors` header in the inspected response, and it exposed `x-powered-by: Next.js`. Add a deliberate security-header policy and remove unnecessary framework fingerprinting.
- The custom `edume-auth` cookie was readable through `document.cookie` and contained encoded access/refresh token material. This is a P0 session-security finding. Move session material to `HttpOnly; Secure; SameSite` cookies or a server-managed session; rotate on login and privilege changes; invalidate on logout, expiry, and permission revocation. Never make bearer or refresh tokens available to page JavaScript.
- Do not treat the encoded value as protection. Base64/encoding is not encryption and does not reduce XSS impact.
- Browser console errors were not persistent on the final isolated route checks, but earlier login/navigation checks recorded RSC fetch fallback errors. Add production error boundaries, route-level telemetry, and a synthetic alert for RSC failures.

### Responsive and accessibility evidence

- At 375x812, the inspected student-detail page had no horizontal overflow and the mobile drawer opened at a usable width. Header controls met a 44px height target.
- Core content actions such as `Print Admission Form`, `Print ID Card`, `Add`, `Archive`, and `Upload Photo` measured roughly 26–30px high. These are below the recommended touch target for non-technical phone users. Increase hit areas without shrinking the visual label.
- Permission-denied, empty, pending, and success states are generally understandable in Bengali. Standardize these states across every portal and include one next action.
- Run keyboard, screen-reader, focus, zoom, reduced-motion, and contrast checks on print controls, tables, dialogs, comboboxes, and the large location tree. A rendered page is not proof of WCAG conformance.

### Priority fix backlog

| Priority | Fix | Acceptance evidence |
|---|---|---|
| P0 | Enforce class/subject attachment in server queries, RLS, server actions, exports, prints, and downloads | Class Teacher cannot see or mutate any other class by list, guessed ID, search, export, or stale tab |
| P0 | Remove auth/refresh tokens from `document.cookie`; secure the session | Browser JavaScript cannot read session material; logout/revocation invalidates old sessions |
| P0 | Stop impossible financial states | SMS pool cannot go negative; trial balance is balanced before settlement/payment actions enable |
| P1 | Restore `/school/classes/routine/print` and make routine/mark-sheet preflight explicit | Valid data prints; incomplete data gives a field-level repair checklist; no 31-second cold preview |
| P1 | Repair fee collection form and distributor CRM stage mutation | Owner records a safe test fee; distributor advances a lead and sees the new stage after refresh |
| P1 | Deduplicate subjects, correction requests, activities, jobs, and repeated test records | Unique identity constraints and list-level duplicate regression tests pass |
| P1 | Paginate/virtualize large location and audit/job datasets | First content stays responsive on low-end Android; search/filter works without loading thousands of rows |
| P1 | Add CSP, frame protection, security headers, and remove `x-powered-by` | Header scanner and manual clickjacking/CSP smoke tests pass |
| P2 | Raise core action hit areas to 44px and standardize empty/error/permission states | Mobile UAT passes with one-thumb interaction and clear recovery path |
| P2 | Seed territory and subject/class teacher fixtures for positive UAT | Gov, subject teacher, and combined-role journeys have both allowed and denied cases |

### Research-backed product targets

The following recommendations are based on current primary/standards documentation, then applied as product-specific inferences from this staging pass:

- **Performance:** use the 75th-percentile Core Web Vitals targets of LCP <= 2.5s, INP <= 200ms, and CLS <= 0.1 as the baseline for dashboard, attendance, fees, exam list, and student home. The mark-sheet preview and location tree currently require route-specific budgets and profiling. Source: [web.dev Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds?authuser=5&hl=en).
- **Next.js delivery:** keep authenticated data dynamic and private, but use route-level loading UI, parallel data fetching, code splitting, safe caching for reference data, and optimized images/fonts. Add production-like `next build`/`next start` measurement rather than relying on development navigation. Source: [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist).
- **Accessibility:** target WCAG 2.2 AA for keyboard access, focus visibility, form errors, reflow, contrast, touch operation, and accessible authentication. Treat this as a human-plus-automated test target, not a Lighthouse-only score. Source: [W3C WCAG 2.2](https://www.w3.org/TR/wcag/).
- **Authorization:** use deny-by-default, least privilege, relationship/attribute-aware checks, validation on every request, object-level lookup protection, safe failure, logging, and automated authorization tests. This matches the product's class/subject relationship model better than a single broad role flag. Source: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- **Sessions:** use framework-tested session mechanisms, secure cookie attributes, HTTPS for the entire session, server-side expiry/invalidation, no session IDs in URLs or browser storage, and no client-readable refresh tokens. Source: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- **Security verification:** adopt OWASP ASVS 5.0 as the release checklist, with versioned requirement references for authentication, session management, access control, validation, logging, and configuration. Source: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/).

### Full-throttle exit decision

**Current status: Release blocked.** The class-teacher cross-class access, browser-readable auth token, impossible SMS/ledger metrics, broken routine print route, fee collection blocker, and unresolved duplicate/event data are sufficient to stop market release. Re-run this pass after P0/P1 fixes with clean staging data and seeded positive fixtures for Subject Teacher, Gov territory, distributor lifecycle, finance reconciliation, and staff permission changes.


---

## Corrections annex (2026-08-28)

Written after map [#524](https://github.com/salmansrizon/Amar_school_LMS/issues/524) executed
against this report. Every entry below was checked at the source — the query, the row counts,
the policy, or the branch — not re-reasoned from the report. Nothing in the body above was
edited.

### How to read this report

**Trust the observation. Re-derive the cause.** The pass saw real screens and wrote down what
they showed; that part held up. Wherever it explained *why* a screen showed that, it was
guessing from the outside, and the guess was usually a bigger, scarier defect than the real
one. Two of the three stated release blockers did not exist.

### Corrections

| Claim in this report | What was actually true | Where |
|---|---|---|
| "Ledger out of balance by ৳2,800.00" — release blocker #2 (lines 19, 206, 391, 515) | The ledger balances exactly. The page summed the first 1,000 of 46,521 rows, and that prefix happens to differ by exactly 280,000 paisa. Nothing was ever unbalanced. | #530, `afdd7b6` |
| "`/super-admin/locations` renders no usable page" — release blocker #1 (lines 182–188, 390) | The route renders. The report's own Pass 2 (line 797) lists `locations` among routes that rendered. The two statements contradict each other and the second one is right. | #525/#529/#530 batch, `91490ea` |
| "Fee collection form never appears" (P1, lines 302, 414) | The form works. One navigation link dropped the `class` query parameter, so the fee page loaded unfiltered and the form had no student to collect against. | #531, `6b9d187` |
| "Class Teacher P0 — sees 82 students across classes" | Not a tenant breach. 82 is the exact student count of her *own* school. A class attachment was unioning with her Grant instead of narrowing it — a model gap inside one tenant, no cross-school data involved. | #525, ADR 0021, `2af9574` |
| "Job monitor flooded with repeated `InvoiceGenerated`, `0` items" (lines 228, 393) | 1,276 events for 1,276 invoices — one each, not duplicates. The `0` the report read as an item count is the **Tries** column. | #537, `de7bf6a` |
| "39 duplicate class combinations" | Not duplication. Orphaned `class_name` TEXT values that match no class row. (Genuine subject duplication *did* exist and was fixed separately — 25 copies of one subject became 1.) | #535/#536, `a3b77e3`, `e7652fa` |
| "`edume-auth` cookie readable through `document.cookie`" (P0) | **The report was right.** An earlier correction of this finding was itself wrong: the cookie exists on `origin/staging` and is readable there. Now HttpOnly. | #527, `ca43790`; #545, `7e3555d` |

### What this means for the release decision

The body's "Release blocked" verdict rested on six items. As of this branch: the ledger
imbalance and the locations blocker never existed; the fee form, the class-teacher model gap,
the routine print route, and the browser-readable token are fixed. The duplicate/event
findings were partly real and are fixed where real.

The decision itself is not re-issued here. Exit gate
[#544](https://github.com/salmansrizon/Amar_school_LMS/issues/544) owns it.

### If you run the next UAT pass

- Report the screen, the URL, the row count, and the exact string. That part of this document
  aged perfectly.
- Do not name a cause you have not checked in the code or the database. Six wrong causes here
  cost more review time than the real defects cost to fix.
- Suspect a total before you suspect a ledger. Two of these findings are one page-level `LIMIT`
  and one mislabelled column.

## Corrections annex (2026-09-07 — map #582, Wave 7)

This entire report predates map [#582](https://github.com/salmansrizon/Amar_school_LMS/issues/582)
— the Class Offering / Student Enrollment / Shift redesign (issues #569-#581). Every "class",
"class/section", and student-placement observation above describes the pre-redesign model
(`classes` table, `students.class_name`/`section` as the sole placement record, no Shift
concept at all). None of it is wrong as a historical record — same rule as the first annex:
trust the observation, not because it still describes today's screens, but because it
accurately describes what this pass actually saw *then*.

**A fresh, targeted live walkthrough (this session, real browser against the real running
app — not vitest) exercised the redesign's own core paths directly**, since a full re-run of
this report's ~30 scenarios was judged disproportionate to what map #582 actually changed:

| Path | Result |
|---|---|
| Institute Shift Configuration (enable Shift, choose Morning + Day) | Pass |
| Class Offering creation, with Shift | Pass — row shows the Shift correctly |
| Class Offering creation, without Shift (still valid) | Pass |
| Global Shift Selection narrowing (uncheck a Shift) and widening back | Pass |
| Admission into a Shift-configured Class Offering | Pass — profile shows the correct Class Offering label, roll number 1 |
| Transfer to a different (No-Shift) Class Offering | Pass — profile updates; confirmed at the database level, not just visually |
| Leaving (Archive) | Pass — confirmed `archived_at` set at the database level |

**Promotion was not separately click-tested.** It shares the exact same underlying primitive
as Transfer (`set_student_enrollment`, per #574's resolution — "Promotion, Repeat, and
Transfer are all callers of this one primitive, not separate mechanisms"), already exercised
above; a fresh Exam with pending students would have been needed to click through the
Promotion screen itself, which this pass judged not worth fabricating given the mechanism is
identical. Flagging the gap rather than silently claiming full coverage.

All fixtures created during this walkthrough (throwaway Students, Class Offerings) were
deleted afterward, and School A's Shift configuration was reverted to No-Shift, its baseline
state before this pass.
