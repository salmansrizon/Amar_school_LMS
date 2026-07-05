# Amar School Management — Web Rebuild PRD

## 1. Summary

Amar School Management is a Bangladeshi school-management product currently shipped as a Java Swing desktop app (`AmarSchoolManagement`) plus a separate vendor/licensing desktop app (`SuperAdminSchoolManagement`), both against a shared MySQL database. This PRD scopes a full rebuild as a single multi-tenant web application, preserving every existing capability across both apps (school operations *and* the vendor's licensing/reseller business) while fixing legacy weaknesses (no per-person vendor login, no Dealer self-service, DB-blob file storage) and modernizing the tech stack.

See [`CONTEXT.md`](../CONTEXT.md) for the canonical glossary (School, School Owner, Staff User, Dealer, Super Admin, Government Official, Territory, Subscription Code) and `docs/adr/` for the architectural decisions this PRD assumes.

## 2. Goals

- Rebuild 100% of existing School-facing functionality (students, employees, attendance, exams/results, accounting/fees, RFID/ID cards, SMS, notices, gallery, feedback, staff permissions) as a web app.
- Rebuild the vendor's licensing/reseller business (Subscription Codes, Territory management, Dealer and Government Official record-keeping, vendor accounting) in the same platform.
- Add genuine Dealer self-service (login, buy Subscription Code batches) — the legacy Dealer role has no login today; this is new, not preserved parity.
- Preserve the Government Official read-only oversight portal as a first-class role.
- Fix known legacy weaknesses: Super Admin's single shared hardcoded secret key becomes real per-person authenticated accounts; DB blob storage for images/PDFs becomes object storage.
- Ship a working prototype on free-tier infrastructure (Vercel + Supabase) before committing to paid infra.

## 3. Non-goals (v1)

- **Student/Parent self-service portal.** Students/parents have no login in the legacy system (only SMS + public notices/gallery); v1 keeps that behavior. A portal is an explicit fast-follow.
- **Real payment gateway integration.** Dealer Subscription Code purchases are approved manually by a Super Admin in v1 (no SSLCommerz/bKash/Nagad integration yet).
- **Offline-first data entry.** The web app is online-only (tolerant of flaky connections, not offline-capable). The legacy desktop app's offline operation is not preserved.
- **Live SDK integration with attendance hardware.** No requirement to talk to a proprietary vendor SDK; covered via the dual-path ingest in ADR 0001 (device push, or a local bridge agent for non-push hardware).

## 4. Roles

| Role | Legacy equivalent | Access model |
|---|---|---|
| **School Owner** | `users` row linked to a `company` | Full access to their School's data and modules |
| **Staff User** | `sub_user` | School Owner grants per-screen access (allow-list, not RBAC tiers) |
| **Dealer** | `dealer_users` (record-only, no login in legacy) | New: self-service login; buys Subscription Code batches for Schools in their Territory |
| **Super Admin** | Hardcoded shared secret key in legacy | Full platform control: Schools, Dealers, Government Officials, Subscription Codes, vendor accounting |
| **Government Official** | `admin_users` (misleadingly named "Admin" in legacy) | Read-only, Territory-scoped oversight into every School in their jurisdiction |

One login page; visible modules and routes are determined by role (ADR 0003). Staff User permission granularity is preserved exactly: boolean per-screen access, not per-action CRUD (ADR-worthy legacy behavior, not a new design).

## 5. Functional Requirements — School Product

### 5.1 Students (`C_STUDENTS`)
- Admission/edit with full profile: identity, address (Village/Union/Upazila/District), guardian info, photo, benefits flags (Freedom Fighter Child, Indigenous), previous-institute info for transfers, sibling info, auto-roll numbering.
- Assign compulsory/optional subjects per class or per student, with bulk "assign all."
- Behaviour log: incident notes + numeric rating + remind date; **entries become read-only 3 days after creation** (anchored to creation timestamp, not the free-text incident date — preserve this rule); rolling average rating view; send SMS from a behaviour record.
- Soft-archive ("Old Students") with restore; class/shift transfer with transfer history report.
- Printable admission/ID templates.

### 5.2 Employees (`C_EMPLOYEE`)
- Full staff/teacher profile (identity, bank info, category, qualification, subject taught, shift, department).
- Office-time configuration globally per shift/category and per-individual override, including a "considerable" grace-minutes window; the effective grace for any attendance check is the **max across every applicable configured value** (global/category default, per-shift value, per-individual override) — e.g. multi-shift workers get the larger grace value (preserve this rule).
- Soft-archive ("Old Employee") with restore.

### 5.3 Attendance (`C_ATTENDANCE`, `C_CARD`)
- Student attendance: mark present/absent per class/shift/section/date, bulk all-present/all-absent, absence-cause capture, attendance book (monthly register, blank + filled print).
- Employee attendance: 6-state status code system (on-time/late entry × on-time/early exit combinations), per-shift office-time grace window, considerable-cause override.
- Leave management (student and employee) feeding into attendance-day exclusion.
- Off-day/holiday calendar (yearly, with "significant" labeling), pullable from a central vendor-maintained list (see §6.5).
- RFID/biometric attendance: assign card numbers to students/employees; ingest attendance logs via the dual-path design in ADR 0001 (device push or bridge-agent upload) rather than the legacy Excel-file import. Reconciliation collapses same-day Attendance Events per person to one finalized record: earliest tap = entry, latest tap = exit, any taps between are discarded as noise.
- Manual-attendance override switch per School (preserve the legacy "de-activate automatic attendance" toggle).

### 5.4 Class & Curriculum Control (`C_CLASS_CONTROL`)
- Classes with section/education-level/optional group-department; rooms with capacity (feeds Exam Seat Plan); subjects with Theory/MCQ/Practical mark configuration and multi-paper support.
- Weekly class routine builder with room/teacher conflict-free assignment, publish + print.
- Per-class syllabus PDF upload/replace.

### 5.5 Exams & Results (`C_EXAM_CONTROL`) — preserve in full, this is the largest legacy module
- Grading scheme (letter/numeric/grade-point) with combinable subject groups and multiple pass-rule strategies.
- Exam setup with Open/Closed state (closing prevents further edits — preserve this rule; verified against legacy: closing is genuinely permanent with no reopen path, and is gated only by ordinary Exam-screen Permission Grant access, not a special elevated permission), subject-teacher assignment, exam routine, seat-plan assignment with room-capacity + duplicate-range checks.
- Optional-subject rules (grade deduction, conditional auto-pass).
- Multi-exam combination (sum or weighted-percentage, remainder auto-assigned), auto-position/merit ranking by grade or mark basis, promotion/roll-transfer application.
- Marks entry, result book, 3 mark-sheet template variants and 3 progress-report variants (with QR-coded authenticity marks, behavior rating, co-curricular checklist), admit card generation (2 templates), all with single and batch "print all" (roll-range + promoted-only filters).
- Result inquiry/search by exam/class/subject.
- Auto-transfer/promotion workflow, including "make old" for graduating students.

### 5.6 Accounting & Fees (`C_ACCOUNTING`)
- Fee structures per class/year (recurring monthly or one-time yearly), with copy-between-class/year.
- Fee collection: split across Fee/Fine/Scholarship-Discount, payment method (cash/cheque/bank), receipt printing with amount-in-words; **one Fee Collection Record per student per month** (preserve this constraint exactly, verified against legacy source: a second payment toward the same month edits that same record's cumulative totals in place — it does not append a payment-history line, and there is intentionally no per-payment audit trail underneath it). Unlike legacy, this constraint will be enforced with a real database-level unique constraint, not just a UI-level check. Absent-fine calculator using working-days formula (Total − Off Days − Approved Leave − Present, with off-day/leave overlap handling).
- Voucher categories (Income/Expense) with attachments; asset register with categories, depreciation, attachments; bank/cash accounts with deposit/withdraw and cheque tracking; director capital tracking (invest/withdraw, running balance).
- Consolidated General Ledger (director cash + assets + vouchers + bank + fee collections) for a date range.
- Negative/insufficient-balance guards preserved throughout (e.g. withdraw blocked if balance insufficient).

### 5.7 SMS (`C_SMS`)
- Compose/send to recipients built from class/shift/section or teacher/staff/management groups, or manual numbers; live character/segment counting.
- Automated absence SMS rules: exact N working-days absent, or absent within an X–Y working-day range, using the same "working days" definition as the §5.6 absent-fine formula. Evaluated by a once-daily scheduled job after that day's attendance is finalized, not triggered instantly on each attendance mark.
- Send summary/log with date-range totals.
- Preserve mimsms.com as the default gateway integration, but make the provider swappable at the architecture level (§ Architecture doc).

### 5.8 Publishing (`C_PUBLISH`, `C_GALLERY`)
- Notices (targeted to all or a specific class/shift/section, optional image/link), homework, lesson plans, daily lessons, exam-prep suggestions (with importance tagging) — shared list/detail UI pattern.
- Photo albums with per-album image cap and per-image size cap (preserve as configurable limits, not hardcoded).

### 5.9 Feedback (`C_FEEDBACK`)
- Aggregated per-institute and per-application satisfaction ratings.
- Inbound question/feedback inbox with unread/read/answered states and email reply.

### 5.10 Staff Permissions (`C_USER_CONTROL`)
- School Owner grants Staff User logins access to specific screens via an explicit allow-list (not role presets) — preserve this exact granularity model.

### 5.11 Institute Setup & Misc (`C_EXTRA`)
- Institute profile: address hierarchy, education levels offered, Bangladesh-specific registration fields (Institute Code, MPO enlistment + code, EIIN No., Center Code), Cluster assignment.
- Administrative activity daily checklist (flag hoisted, anthem rendered, etc.) with date-range reporting.
- Logistics/physical-file index (type, year, physical storage location).
- Blank printable templates for paper-based fallback admission/lesson/homework collection.

## 6. Functional Requirements — Vendor / Licensing Product

### 6.1 Territory & Location Management
- 4-level Bangladesh location hierarchy (Zone/Division → District → Upozilla → Union); adding a child requires its parent to exist; deleting a node cascades to descendants.
- Clusters: named groupings of Schools within a location node, for reporting/organization.
- Recursive "view all Schools/aggregate totals under this node and its descendants" — this recursive-inclusion pattern underlies Territory assignment everywhere and must be preserved.
- A Dealer or Government Official may hold **multiple** Territory assignments at once (e.g. two separate Unions), each independently tiered — assignment is a list, not a single field. "Extended School access" (§6.3/§6.4) is the same list, just with a row pointing at one School instead of a location node.

### 6.2 Subscription Codes (Licensing)
- Super Admin generates batches (1–50 at a time) of unique codes with a chosen validity period (1–24 months) and price (0 = free/promotional).
- Redemption extends a School's expiry date by the code's validity, stacking onto `max(today, current expiry)` — a still-active School's redemption extends its existing expiry, but a lapsed/expired School's redemption starts fresh from the redemption date rather than compounding onto a stale past-expiry date; single-use; used codes cannot be deleted.
- New in the rebuild: Dealers can purchase batches of codes online for Schools in their Territory (self-service — see §Non-goals for payment handling in v1: Super Admin manually approves/marks paid).
- Trial logic preserved: a School with no code history is "in trial" and gets full feature access; per-tenant feature flags (§6.6) can restrict this independent of subscription state. Redeeming **any** code — including a price-0 promotional one — counts as code history and permanently ends Trial status.

### 6.3 Dealer Management
- Super Admin creates/edits/blocks/deletes Dealer accounts: profile, Territory assignment(s) (§6.1 — a Dealer may hold more than one), plus optional "extended" access to individual out-of-territory Schools (same assignment mechanism, School-scoped instead of location-scoped). Tier designation (Division/Zilla/Upzilla/Union Dealer) is a property of each Territory assignment, not the Dealer as a whole; it is descriptive/organizational only — it does not drive pricing, commission, or code-purchase permissions.
- New in rebuild: Dealer self-service login, dashboard of Schools/codes across all their Territory assignments, and the code-purchase flow from §6.2. Extended-access Schools are visually flagged (e.g. "Extended access" badge) wherever they appear in the Dealer's Schools list.

### 6.4 Government Official Management
- Super Admin creates/edits/blocks/deletes Government Official accounts: profile, designation (from the fixed government title list), education-level scope, Territory assignment(s) (§6.1 — may hold more than one), plus optional extended individual-School access (same assignment mechanism, School-scoped).
- Government Official self-service login to a read-only dashboard: aggregate counts (institutes/students/employees) across their jurisdiction, searchable institute list, and full read-only drill-down into any School's live data (attendance, exams, fees summaries, gallery, feedback, syllabus) — a School only appears if it isn't blocked and its subscription hasn't expired. Extended-access Schools are visually flagged (e.g. "Extended access" badge) — never silently indistinguishable from an in-territory School, given the oversight/accountability expectation on this role.
- Territory-performance reports (institute-level and employee-level attendance performance) over configurable date ranges.

### 6.5 Vendor-Side School Administration ("All Users Control")
- Per-School actions: edit login email, block/unblock, force-offline, live support chat, per-tenant feature-flag toggles (independent of subscription — preserve the full list of togglable modules), full profile edit (mirrors §5.11 fields), attendance-consideration rule configuration, transaction/financial dashboard per School, RFID management entry point, manual-attendance override, leave/consider-adjustment override, SMS to one or all Schools, student-mobile-list export, manual Subscription Code application with expiry preview, push the central off-day list to a School, and manual expiry-date correction ("decrease month," available only when a real, currently-active expiry date exists to move — unavailable for a trial School with no code history, and a no-op once already expired).

### 6.6 Central Off-Day / Holiday Template (`C_SUPER_DEMO`)
- Super Admin maintains a yearly central holiday calendar; individual Schools pull ("upload") the current year's list into their own off-day calendar on demand.

### 6.7 Vendor Accounting (`C_SUPER_ACCOUNTING`)
- Same shape as School accounting (§5.6: directors, assets with depreciation, vouchers, bank accounts, general ledger) but scoped to the vendor's own books, with the added ability to attribute a voucher/deposit to a specific School (this is where subscription revenue collected from Schools gets recorded) and to transfer/return physical assets (RFID cards/machines) to specific Schools with a batch "binding code" inventory mechanism.

### 6.8 Vendor SMS (`C_SUPER_SMS`)
- Send SMS to Schools/contacts with area-filtered mobile-list building (Excel upload/download), gateway balance/credit checking before send (tracked as an internal asset-category quantity), API key/sender ID configuration.

### 6.9 Attendance Auto-Processing
- A background job converts raw RFID card-tap events into finalized attendance records across all Schools, honoring each School's own shift/office-time/consider-minutes/punch-mode settings. Rebuilt as a proper server-side job/queue (replacing the legacy single-hardcoded-server-IP polling script) — see Architecture doc.

## 7. Cross-Cutting Requirements

- **Localization**: Bangladesh-specific fields (MPO/EIIN/Center Code, Bangla address hierarchy) and currency ("Tk") throughout — preserve as configurable/localized values, not assume they generalize to other countries (legacy code already hardcodes "service not available" for non-BD).
- **Bilingual UI (new scope, not legacy parity — see ADR 0004)**: the interface itself (labels, menus, system messages) ships in Bangla and English, with **Bangla as the default/primary language** and English as a switchable secondary. Legacy's UI chrome is 100% English (verified against source); this is a deliberate expansion, not a port — full i18n infrastructure and translated copy are required across every screen in this PRD.
- **Printing**: nearly every module ends in a print-preview → print/PDF flow (receipts, mark sheets ×3, progress reports ×3, admit cards, ID cards, attendance books, routines, admission forms). The web app needs a consistent PDF-generation strategy covering all of these (see Architecture doc).
- **File attachments**: move from DB blobs with client-enforced size caps to real object storage (Supabase Storage) with server-enforced limits; preserve the existing per-feature size/count caps as configurable values (e.g. gallery: 1MB/image, 20/album; vouchers/assets: 500KB image, 5MB PDF).
- **Auth improvement (not a functionality loss)**: Super Admin's legacy single shared secret key becomes real, individually-audited per-person accounts.

## 8. Fast-Follows (explicitly deferred, not forgotten)

1. Student/Parent self-service portal.
2. Real payment gateway for Dealer code purchases (SSLCommerz/bKash/Nagad).
3. Per-Dealer attribution of which Subscription Code batch was sold to which School (legacy has no such tracking; worth adding once Dealer self-service ships).
4. Offline-capable attendance/marks entry, if field experience shows connectivity is a real blocker.

## 9. Migration

Big-bang, staged per-School cutover: migrate one School's full dataset from the legacy MySQL schema to the new Postgres schema in a single scripted pass with a rollback window, verify, then retire the desktop app for that School before moving to the next. Order of migration (smallest/simplest Schools first) is an operational decision made at rollout time, not fixed here.

## 10. Open Questions

- ~~Exact scope of "extended schools" access (individual out-of-territory grants) UX for Dealers and Government Officials — needs a design pass, not just a data-model port.~~ **Resolved**: extended access is not a separate mechanism — it's an ordinary Territory assignment row pointing at a single School instead of a location node. UX requirement: it must be visually flagged (e.g. "Extended access" badge) wherever the School appears in the assignee's list, for both Dealers and Government Officials — never silently indistinguishable from an in-territory School, since Government Official access in particular carries an oversight/accountability expectation.
- ~~Whether per-tenant feature flags (§6.5) become a real plan/tier system (e.g. Basic/Pro) or stay as ad-hoc Super-Admin toggles.~~ **Resolved**: stay as ad-hoc flat booleans for v1 (matches legacy `service_block_panel` exactly); a Plan Tier system can be layered on top later as named presets writing to the same flags, without a schema change.
- ~~SMS gateway account structure: one vendor-wide mimsms.com account today — confirm whether Schools/Dealers ever need their own gateway credentials in the rebuild.~~ **Resolved**: stays one vendor-wide account, matching legacy; SMS credit/balance remains a vendor-level internal accounting concept, not a per-School credential/balance. `SmsGateway` interface (Architecture §5) is about provider swappability only, not per-tenant account ownership.
