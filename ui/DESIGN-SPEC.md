# UI Mockup — Design Spec & Screen Inventory

Static HTML mockups for the Amar School Management web rebuild, implementing the design
decisions resolved in the `/grill-with-docs` session (see `CONTEXT.md` and `docs/adr/0004`,
`docs/adr/0005` for the full reasoning — this file only states the *rules*, not the *why*).

Read this whole file before writing any page. Consistency across pages matters more than any
individual page being clever.

## Hard rules

1. **Every page links the shared stylesheet and script**, using a relative path back to `ui/shared/`:
   ```html
   <link rel="stylesheet" href="../shared/design-system.css">
   <script src="../shared/app.js" defer></script>
   ```
   (From `ui/school-owner/students-list.html`, the path is `../shared/design-system.css`. Adjust
   the relative path depth to wherever your file actually sits — don't hardcode absolute paths.)

2. **Never hardcode a color.** Use the CSS custom properties / utility classes already defined
   in `design-system.css` (`--brand-*`, `--success-*`, `--warning-*`, `--danger-*`, `--info-*`,
   `.badge-*`, `.btn-*`, etc.). If you need a color that isn't a token, that's a sign you're
   about to break consistency — reuse the closest existing token instead of inventing a hex value.

3. **Purple (`--brand-*` / `--accent`) is chrome and primary-action color only.** Never use it to
   mean a status (active/expired/pass/fail/etc.) — that's what `.badge-success/warning/danger/info`
   are for.

4. **Bilingual markup, no exceptions.** Every piece of UI copy — labels, buttons, table headers,
   nav items, placeholders, empty states, everything — is wrapped in both spans:
   ```html
   <span data-i18n="bn">শিক্ষার্থী</span><span data-i18n="en">Students</span>
   ```
   The shared `app.js` shows/hides based on `<html data-lang="bn|en">` (Bangla is default — do
   not build a page that only has one language hardcoded). For dense running Bangla sentences
   inside data (e.g. a Behaviour Log note), a single Bangla string without an English pair is
   fine — this rule is about **UI chrome**, not user-entered data content.

5. **Compact density, fixed.** Use `table.data-table` as-is (36px row height). Do not add a
   density toggle or invent a spacious variant.

6. **Small consistent radius.** Use `--radius-sm/md/lg` as already applied in the shared CSS
   classes. Don't introduce a sharp/flat variant for "data" surfaces.

7. **Every list screen needs**: a toolbar (search + relevant filters + primary create action),
   a `table.data-table`, and status expressed via `.badge-*`. Every create/edit screen needs a
   `.form-grid` of `.field`s. Every irreversible/destructive action needs a `.modal` confirm step.

8. **File naming**: lowercase-kebab-case, `.html` extension, one screen (or one modal state) per
   file. Cross-link related screens with real relative `<a href>`s (e.g. a table row's "View"
   link should point at the actual detail file), so clicking through feels like one app, not a
   pile of disconnected screenshots.

## Shell markup (copy this exactly, then fill in the `<!-- FILL -->` parts)

Every School-product page (School Owner and Staff User) uses this shell:

```html
<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<title><!-- FILL: Bangla title · English title --></title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="../shared/design-system.css">
<script src="../shared/app.js" defer></script>
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <div class="brand"><span class="mark">A</span><span>Amar School</span></div>
    <nav>
      <a class="nav-item <!-- add 'active' on the current screen -->" href="../school-owner/dashboard.html"><span data-i18n="bn">ড্যাশবোর্ড</span><span data-i18n="en">Dashboard</span></a>
      <a class="nav-item" href="../school-owner/students-list.html"><span data-i18n="bn">শিক্ষার্থী</span><span data-i18n="en">Students</span></a>
      <a class="nav-item" href="../school-owner/employees-list.html"><span data-i18n="bn">কর্মচারী</span><span data-i18n="en">Employees</span></a>
      <a class="nav-item" href="../school-owner/attendance-student-mark.html"><span data-i18n="bn">উপস্থিতি</span><span data-i18n="en">Attendance</span></a>
      <a class="nav-item" href="../school-owner/classes-list.html"><span data-i18n="bn">শ্রেণি ও পাঠ্যক্রম</span><span data-i18n="en">Class & Curriculum</span></a>
      <a class="nav-item" href="../school-owner/exams-list.html"><span data-i18n="bn">পরীক্ষা ও ফলাফল</span><span data-i18n="en">Exams & Results</span></a>
      <a class="nav-item" href="../school-owner/fee-collection.html"><span data-i18n="bn">হিসাব ও ফি</span><span data-i18n="en">Accounting & Fees</span></a>
      <a class="nav-item" href="../school-owner/sms-compose.html"><span data-i18n="bn">এসএমএস</span><span data-i18n="en">SMS</span></a>
      <a class="nav-item" href="../school-owner/notices-list.html"><span data-i18n="bn">প্রকাশনা</span><span data-i18n="en">Publishing</span></a>
      <a class="nav-item" href="../school-owner/feedback-inbox.html"><span data-i18n="bn">মতামত</span><span data-i18n="en">Feedback</span></a>
      <a class="nav-item" href="../school-owner/staff-permissions.html"><span data-i18n="bn">স্টাফ অনুমতি</span><span data-i18n="en">Staff Permissions</span></a>
      <a class="nav-item" href="../school-owner/institute-profile.html"><span data-i18n="bn">প্রতিষ্ঠান সেটআপ</span><span data-i18n="en">Institute Setup</span></a>
    </nav>
  </aside>
  <div class="main">
    <div class="topbar">
      <div class="title"><!-- FILL: page title, bilingual --></div>
      <div class="actions">
        <div class="lang-switch">
          <button data-lang-btn="bn" onclick="setLang('bn')">বাং</button>
          <button data-lang-btn="en" onclick="setLang('en')">EN</button>
        </div>
        <div class="theme-switch">
          <button data-theme-btn="light" onclick="setTheme('light')">☀</button>
          <button data-theme-btn="dark" onclick="setTheme('dark')">☾</button>
          <button data-theme-btn="system" onclick="setTheme('system')">Auto</button>
        </div>
      </div>
    </div>
    <div class="content">
      <!-- FILL: page content -->
    </div>
  </div>
</div>
</body>
</html>
```

**Staff User pages** use the identical shell, except: (a) any nav item the Staff User's
`staff_permissions` allow-list doesn't grant gets `class="nav-item disabled"` with no `href`
(or a dead `href="#"`), and (b) at least one screen (`staff-user/permission-denied.html`)
demonstrates what happens when a Staff User tries to reach a screen they don't have — a plain
message state, not a full page.

**Vendor-product pages** (Super Admin, Dealer, Government Official) use the same shell
structure, with `.sidebar .brand` reading the role name and nav items swapped for that role's
modules (see each cluster's inventory below for the exact nav item list to use — keep it
identical across every page for that role, only the `active` class moves).

## Screen inventory

Build exactly these files, in these directories. "List/Detail/Create/Modal" after a module name
tells you which states to produce; a bare filename is one screen.

### `ui/school-owner/` (cluster A — Students, Employees, Attendance)

- `dashboard.html` — KPI cards (students/employees/attendance-today/subscription status —
  reuse the Trial/Active/Expired badge language), recent activity list, quick actions. This is
  the screen every nav-item link in the shell above points at for "Dashboard" — build it first
  so links resolve.
- `students-list.html` — dense table: roll, name (Bangla), class/section, guardian, Behaviour
  Log rolling-average badge, status (`Active` / `Old Student`), row links to `student-detail.html`.
- `student-detail.html` — tabs: identity, address (Village/Union/Upazila/District), guardian,
  photo, benefits flags (Freedom Fighter Child, Indigenous), previous-institute/transfer info,
  siblings. Include a Behaviour Log section on this page or link to `student-behaviour-log.html`.
- `student-admission-form.html` — the create/admission form, `.form-grid` of `.field`s matching
  the profile fields above, auto-roll-number shown as read-only.
- `student-behaviour-log.html` — list of entries (note, rating, remind date, created timestamp);
  at least one entry older than 3 days shown with edit controls disabled and a
  `<span class="locked-note">` explaining why (anchored to creation time, not incident date —
  this is a resolved, deliberate rule, not a bug to hide).
- `students-archive.html` — "Old Students" list with a Restore action per row.
- `student-transfer-modal.html` — class/shift transfer form as a `.modal`, plus a small transfer
  history table beneath it.
- `employees-list.html` — dense table: name, category, qualification, shift, department, status.
- `employee-detail.html` — profile tabs (identity, bank info, category, qualification, subject
  taught, shift, department) plus an office-time/Considerable Grace Window section showing
  global/category/shift/override values and which one currently wins (the max — annotate this).
- `employee-create-form.html` — create form mirroring the profile fields.
- `employees-archive.html` — "Old Employee" list with Restore.
- `attendance-student-mark.html` — class/shift/section/date picker, roster with present/absent
  toggles per student, bulk all-present/all-absent buttons, absence-cause field.
- `attendance-book.html` — monthly register grid (students × days), print-preview framing
  (e.g. a bordered "page" look), blank vs. filled toggle.
- `attendance-employee.html` — table of employees with the 6-state status (on-time/late ×
  on-time/early-exit combinations) shown as distinct badges, plus a note showing which
  Considerable Grace Window value applied.
- `leave-management.html` — leave requests list (student/employee) with approve/reject actions.
- `off-day-calendar.html` — yearly calendar grid, "significant" days visually distinguished, a
  "Pull from central list" button.
- `rfid-card-assignment.html` — simple form: search a student/employee, assign a card number.

### `ui/school-owner/` (cluster B — Class & Curriculum, Exams & Results)

- `classes-list.html` — classes with section/education-level/group-department, room list with
  capacity, subject list with Theory/MCQ/Practical configuration.
- `class-routine-builder.html` — weekly grid (days × periods), room/teacher assignment per cell,
  a conflict highlighted in a danger badge, Publish button.
- `syllabus-upload.html` — per-class file upload control (PDF), showing current file + replace.
- `exams-list.html` — table of exams with an Open/Closed `.badge` per row; a Closed row's row
  actions are visibly reduced (only "View Result" remains active, others grayed/disabled) —
  this needs to visually communicate the resolved rule that Closed is permanent and not
  specially permission-gated.
- `exam-setup.html` — grading scheme config (letter/numeric/grade-point), subject-teacher
  assignment table, pass-rule strategy selector.
- `exam-close-confirm-modal.html` — the irreversible confirmation `.modal`, with explicit warning
  copy that this cannot be undone (mirrors the legacy confirm dialog's intent).
- `exam-routine.html` — exam schedule grid.
- `seat-plan.html` — room-capacity seat assignment with a duplicate-range warning state shown.
- `marks-entry.html` — subject × student marks grid.
- `result-book.html` — computed results table (grade/mark basis), merit/position column.
- `mark-sheet-preview.html` — a print-style preview: institute header, student info block, grade
  panel, QR placeholder, "powered by" footer — framed to look like a print-preview pane.
- `progress-report-preview.html` — same print framing, with behaviour rating + co-curricular
  checklist sections.
- `admit-card-preview.html` — print-style admit card layout.
- `result-inquiry.html` — search-by-exam/class/subject form + results table.
- `promotion-transfer.html` — promotion workflow screen: roll-transfer list, "make old" action
  for graduating students.

### `ui/school-owner/` (cluster C — Accounting/Fees, SMS, Publishing, Feedback, Staff Permissions, Institute Setup)

- `fee-structures.html` — fee structure list per class/year, Copy-to-another-class/year action.
- `fee-collection.html` — collection form; **must show the "already have a payment info for this
  month, please edit" redirect state** for a student+month that already has a record (this is a
  resolved, deliberate rule — link to `fee-collection-edit-modal.html` rather than a blank error).
- `fee-collection-edit-modal.html` — edits the same record's cumulative pay/due amounts in place
  (no "add another payment" line-item list — that's a deliberately absent feature, don't add one).
- `vouchers-list.html` — Income/Expense voucher list with attachment icons.
- `asset-register.html` — asset list with category, depreciation, attachment.
- `bank-cash-accounts.html` — accounts list, deposit/withdraw actions, a withdraw blocked by
  insufficient balance shown as a disabled button + explanatory tooltip/note.
- `director-capital.html` — invest/withdraw ledger with running balance.
- `general-ledger.html` — consolidated ledger table with a date-range picker.
- `sms-compose.html` — recipient-group builder (class/shift/section or staff groups or manual
  numbers), live character/segment counter.
- `sms-absence-rules.html` — the N-day / X–Y-day range rule configuration form.
- `sms-log.html` — send history table with date-range totals.
- `notices-list.html` — notices/homework/lesson-plan/exam-prep shared list pattern, importance
  tag badges.
- `notice-create.html` — create form with target audience (all or class/shift/section), optional
  image/link.
- `gallery-albums.html` — album grid with per-album image-count cap shown (e.g. "12/20 photos").
- `gallery-album-detail.html` — image grid within one album, per-image size cap noted.
- `feedback-inbox.html` — inbox list with unread/read/answered `.badge` states, reply action.
- `feedback-ratings.html` — aggregated satisfaction rating dashboard.
- `staff-permissions.html` — the actual allow-list UI: a Staff User selector + a checklist of
  every screen/module with a toggle (this is the source of truth other pages reference).
- `institute-profile.html` — address hierarchy, education levels, MPO/EIIN/Center Code fields,
  Cluster assignment.
- `activity-checklist.html` — daily checklist (flag hoisted, anthem rendered, etc.) with a
  date-range report view.
- `logistics-index.html` — physical-file index table (type, year, storage location).
- `blank-templates.html` — list of downloadable blank paper-fallback templates.

### `ui/super-admin/` (cluster D — Vendor / Licensing Product)

Sidebar nav for every Super Admin page (same list, only `active` moves):
স্কুলসমূহ/Schools, ডিলার/Dealers, সরকারি কর্মকর্তা/Government Officials, সাবস্ক্রিপশন
কোড/Subscription Codes, টেরিটরি ও লোকেশন/Territory & Locations, ভেন্ডর হিসাব/Vendor Accounting,
ভেন্ডর এসএমএস/Vendor SMS, কেন্দ্রীয় ছুটির তালিকা/Central Off-Day.

- `schools-list.html` — all-Schools table (the "All Users Control" list): status, subscription
  badge, block/unblock action.
- `school-detail-admin.html` — per-School admin actions: feature-flag toggle list (flat booleans,
  not a plan/tier system — resolved decision), expiry correction control (only enabled when a
  real active expiry exists — show the disabled state for a Trial school as well as the normal
  state for an active one), force-offline, live-support-chat entry point.
- `locations-tree.html` — the 4-level location hierarchy as an expandable tree, add-child
  disabled unless a parent is selected.
- `clusters.html` — cluster list with School membership.
- `codes-batch-generate.html` — batch generation form (count 1–50, validity 1–24 months, price).
- `codes-list.html` — generated codes table, redeemed/unredeemed status, redeemed codes'
  delete action disabled.
- `dealers-list.html` — Dealer accounts table.
- `dealer-detail.html` — profile + **Territory assignments table showing more than one
  assignment row at different tiers**, plus an Extended-access row using `.badge-extended` —
  this page needs to visibly prove the multi-assignment/per-assignment-tier decision, not just
  describe it.
- `gov-officials-list.html` — Government Official accounts table.
- `gov-official-detail.html` — profile + designation + education-level scope + Territory
  assignments (same pattern as `dealer-detail.html`, including the Extended-access badge).
- `central-holiday-calendar.html` — the yearly holiday template Super Admin maintains.
- `vendor-accounting-ledger.html` — same shape as School accounting, with a "attribute to School"
  field on vouchers/deposits.
- `binding-code-inventory.html` — batch binding-code inventory for RFID card/machine transfers
  to Schools.
- `vendor-sms-compose.html` — area-filtered mobile-list builder, gateway balance/credit shown
  before send.
- `attendance-job-monitor.html` — background reconciliation job status dashboard: last run,
  events processed, any failures — reflecting the daily-batch (not real-time) job design.

### `ui/dealer/` and `ui/gov-official/` and `ui/staff-user/` (cluster E)

Dealer sidebar: ড্যাশবোর্ড/Dashboard, আমার স্কুল/My Schools, কোড ক্রয়/Purchase Codes.

- `ui/dealer/dashboard.html` — KPIs (schools in territory, codes sold), Schools list reachable
  via all of the Dealer's Territory assignments aggregated, Extended-access badge where relevant.
- `ui/dealer/code-purchase.html` — batch code purchase form, "pending Super Admin approval"
  status shown (no live payment gateway — resolved non-goal for v1).

Government Official sidebar: ড্যাশবোর্ড/Dashboard, প্রতিষ্ঠান তালিকা/Institute List,
পারফরম্যান্স রিপোর্ট/Performance Reports.

- `ui/gov-official/dashboard.html` — aggregate counts across jurisdiction, searchable institute
  list, all read-only (no edit affordances anywhere on this page or its children).
- `ui/gov-official/school-drilldown.html` — read-only drill-down into one School's attendance/
  exams/fees-summary/gallery/feedback/syllabus.
- `ui/gov-official/performance-reports.html` — institute-level and employee-level attendance
  performance report with a date-range picker.

- `ui/staff-user/dashboard.html` — identical shell to School Owner's dashboard, but with 2–3
  `nav-item disabled` entries (screens this Staff User wasn't granted) to demonstrate the
  allow-list model visually.
- `ui/staff-user/permission-denied.html` — the state shown if a disabled nav item is somehow
  reached directly: a plain centered message, not a full page layout.

## When you're done

Cross-check your files against this list — every bullet above should be a real file that opens
and links correctly from the shared nav shell. Don't invent extra screens beyond this list;
don't skip any either.
