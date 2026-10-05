# Cross-cutting UX audit - School Owner (mobile / Bangla / a11y / consistency)

Data: raw/m390-bn.json + m390-fix.json (390x844 bn, 76 pages), raw/m360-en.json + m360-fix.json (360x740 en), raw/d1440-bn-dark.json (1440 bn dark, axe contrast), raw/d1440-en-merged.json (1440 en light, axe full, 77 pages), raw/terms-en|bn*.json (labels/dates/money), raw/keyboard.json + kb2.json (keyboard), raw/mdeep390.json (mobile overlays).
Caveat: dev server (next dev): load times include on-demand compile. Server was down intermittently during the crawl; affected pages were re-run.

## Coverage
76 owner pages x {390 bn, 360 en, 1440 en light + axe, 1440 bn dark + contrast}, including tabs, detail pages, ?view= drawers (students, sms log, staff). Not covered: super-admin/teacher/student roles; destructive flows (no forms submitted); bottom-sheet modals on mobile only partially (mdeep probe interrupted by dev-server aborts); /school/attendance/mark and /school/approvals navigation sometimes ERR_ABORTED in script (client redirect) but audited fine in main crawl.

## 1. Mobile (390 bn, 360 en)
- Page-level horizontal overflow: NONE on 76/76 pages at both widths (scrollW == innerW).
- Internal scrollers (acceptable, but no scroll affordance): attendance/book table 981px in 252px; employees/archive 710/278; machine/students 717/318; machine/employees 585/318; leave/student 479/276; classes/syllabus 538/318; fees/ledger 640/254; exams sub-nav 795/320; fees sub-nav 868/320; sms sub-nav 334/320; institute sub-nav. attendance/book scroller is not keyboard-focusable (axe scrollable-region-focusable).
- Bottom nav covers content: NO (bottomCover.covered empty on all pages; content has bottom padding).
- Overlays at 390: profile popover 256x303 fits; search palette is full-screen 390x844; no doc overflow when open.
- Tap targets <40px, all from SHARED chrome (counts = pages out of 76):
  - profile avatar button 36x36 (59) - components/app-shell.tsx:~476 (`size-9`, not ICON_BUTTON)
  - breadcrumb links 54x20 / 47x20 / 100x20 (46 / 8 / 13) - school-crumbs breadcrumb nav
  - unnamed icon button 32x42 (39)
  - BackLink 36x36 (15) - components/back-link.tsx `size-9`
  - pager page-size links 10/20/50 and page numbers 32x32 (11+) - components/pager.tsx:46 `h-8 min-w-8`
  - row checkboxes 16x16 (students list), inline text links 16px tall ("see all" 62x16), delete 46x24, upload 73x24, "ছুটি ব্যবস্থাপনা" tab 92x28
  - Standard exists but is not applied: lib/ui-tokens.ts ICON_BUTTON = min-h-11 min-w-11.
- Fonts <12px: bottom-nav labels 11px on 66/66 pages (components/school-shell.tsx:100 `text-[11px]`); "Powered by" 10px on 66/66 (components/powered-by-footer.tsx:5); badges text-[10px] (dashboard).
- Clipped titles: h1 uses truncate; e.g. attendance "শিক্ষার্থী উপস্থিতি — হাজিরা নিন" 213px of 306px; exam sub-pages 306 of 508-657px (title incl. exam name cut with no tooltip).
- Tables usable via internal scroll; students list renders as cards.

## 2. Bangla / language
en UI: no Bangla leakage except user data (names) and the currency symbol.
bn UI problems (verified in raw/*terms-bn.json, m390-bn.json):
- Money uses Latin digits / inconsistent grouping: fees ledger "৳500, ৳83,501" (Latin); fees list "৳৫০০" (Bangla); director-capital "৳১৩,৯৫,০০০" (Indian grouping) vs ledger western grouping; sms/buy "৳200.00 / ৳500.00" (2 decimals Latin) vs fees "৳৫০০" (none). Root: 14 sites call `৳${n.toLocaleString()}` with no locale (app/school/fees/ledger/page.tsx:233-235, bank-controls.tsx:123, director-capital-controls.tsx:38, vouchers/[id]/page.tsx:56, ...) and lib/money.ts formatTaka hard-codes 'en-BD'.
- Dates in 6+ formats (see section 3); bn pages show raw ISO "2026-07-16" (sms/rules), "2026-10-03" (institute/checklist), "ছুটির দিন ক্যালেন্ডার — 2026", "মাস: ১০/2026" (mixed digits, fees), "৩/১০/২০২৬, ৭:৪১:৩৩ AM" (sms/log, Latin AM/PM), activity "৩ অক্টো, ০৮:৫৮ AM".
- Latin digits where Bangla expected: classes tab "শ্রেণিসমূহ 1 / বিষয়সমূহ 2" (while neighbours show "(১)"), students "রোল 1", employees "মেশিন আইডি 229", attendance serial column and counts "275/278" on mark/book/leave/machine pages, "57ঘণ্টায় উত্তর" (Latin and no space) on /questions, "54.6ঘণ্টা" on response, "0%" employee attendance.
- English strings in bn UI: "Powered by" (66 pages), "ঠিক N দিনের নিয়ম" (placeholder N shown to user, sms/rules), raw enum "student_leave" and "test_two_stage" (approvals), aria-labels "Open menu"/"Close menu"/"Visit EdumeBD" (142/132 pages), "Notifications alt+T", "AM/PM", "সর্বোচ্চ ২ MB", "গ্রেড পয়েন্ট (GPA)", "RFID", "NID", "EIIN" (acceptable acronyms), "Class 1 / A" and "Morning - A" (seed data names).
- Word choice drift (bn): attendance = উপস্থিতি (nav, dashboard "উপস্থিতি নিন") vs হাজিরা (page "হাজিরা নিন", "হাজিরা খাতা", tab "শিক্ষার্থী হাজিরা"); employee = কর্মচারী vs স্টাফ (staff page "স্টাফ অনুমতি", "নতুন স্টাফ লগইন"); due = বকেয়া (fees) vs বাকি (dashboard checklist "বাকি", questions "উত্তর বাকি"); seat plan = "সিট প্ল্যান" title vs "আসন বিন্যাস প্রিন্ট" button on same page; Publishing create = "নতুন তৈরি করুন" repeated; compose = "রচনা করুন"; informal imperative "যোগাযোগ করো" (my-classes) vs formal "করুন" elsewhere; view = দেখুন vs দেখাও (response page); fee collect = "ফি কালেকশন" vs "ফি আদায়"; institute checklist "দৈনিক চেকলিস্ট" vs dashboard "কার্যক্রম চেকলিস্ট" vs en "Activity Checklist".
- Truncated Bangla: 11px bottom-nav labels "ব্যক্তিবর্গ / পাঠদান / অর্থ ও ফি" fit but at 11px; language switch shows "বাং" (abbreviated, 4.09:1 in dark).

## 3. Consistency (system-wide)
### 3a Terms for same concept
| Concept | Variants (location) | Proposed standard |
|---|---|---|
| Student list title | "Students List" (/students), "Old Students" (/students/archive), nav "Students" | "Students" / "Archived students" |
| Archive | route /archive, titles "Old Students/Old Employees/Old Classes", button "Archive" | "Archived X", button "Archive" |
| Attendance take | "Mark Attendance" (tab/dashboard), "Student Attendance — Mark" (h1), "Student Attendance" (tab bn), nav "Attendance" | "Take attendance" everywhere; bn "হাজিরা নিন" |
| Leave | "Leave Management" (tab), "Student Leave Management" (h1), "Request Leave" (button), "Leave requests" (employees), "Leave" | "Leave requests" page, "New leave request" button |
| Exams | nav "Exams & Results", h1 "Exam & Result Management", tab "Exams & Results" | "Exams & Results" |
| Add/new button | "+ New Admission", "+ New employee", "+ New exam", "+ Add Class", "+ New" , "+ New staff login", "Add machine", "Add Office Hour", "Add Grace Rule", "Create New Employee", "Create Account", "Add combination", "Add Grading Scheme", "Add item", "+ Invest" | "+ New <noun>" for primary create in header; "Add" only inside lists |
| Save/submit | "Save Admission", "Save Employee", "Save Attendance", "Save", "Publish", "Confirm Transfer", "Decide", "Send Now", "Buy", "Apply", "Show", "Create" | "Save" (draft/edit), "Publish"/"Send" only for external actions |
| Filter | "Filter" (most), "Apply" (sms/log, ledger, checklist), "Show" (response), "View Log" (student-log), "ফিল্টার করুন"/"ফিল্টার"/"প্রয়োগ করুন"/"অনুসন্ধান করুন" | "Apply filters" (+ "Clear filters") |
| Print | "Print", "Print All", "Print seat plan", "Print ID cards", "Print Admission Form" | "Print" (+ object only when ambiguous) |
| View | "View", "View All", "See all", "Review", "Profile", "Open", "Decide" | "View" |
| Due | "Fee due", "Due (0)", "DUE" (checklist pending), "Not in yet" | "Due" only for money; checklist "Pending" |
| Sentence vs Title case | "Fee due"/"Not in yet" vs "Old Students"/"Mark All Present"/"Student Leave Management" | Sentence case for all UI labels, Title Case never |
### 3b Date formats
en: "03/10/2026" (approvals, sms/log, fees, vouchers, archives), "3 October 2026" (dashboard), "30 Aug 2026" (students/archive, staff), "7 Sept 2026" (staff), "2026-07-16"/"2026-10-03" (sms/rules, checklist), "Oct 2026" month titles, "dd Mon weekday" (student log), hard-coded 'en-GB' (fees/receipt/[id], students/[id]/behaviour-controls) and bare toLocale* on mark-form.tsx:43. 47 toLocale*String calls under app/school/components/lib, 11 distinct option sets.
bn: "৩/১০/২০২৬" (non-padded), "৩০ আগ, ২০২৬", "৩ অক্টোবর, ২০২৬", "২০২৬-০৭-১৬" ISO Latin, "৩ অক্টো, ০৮:৫৮ AM".
Standard: one `formatDate(d, lang, 'short'|'long'|'datetime')` helper (lib/format.ts) using `Intl.DateTimeFormat(lang==='bn'?'bn-BD':'en-GB', {day:'2-digit',month:'short',year:'numeric'})`; 12h time with localized AM/PM; ISO only in inputs.
### 3c Money formats
"৳500" (fees), "৳83,501" (ledger, western), "৳1,395,000"/"৳১৩,৯৫,০০০" (director-capital: en western, bn lakh), "৳200.00" (sms/buy, formatTaka 2dp). Standard: `formatTaka(amount, lang)` -> `৳` + Intl.NumberFormat(lang==='bn'?'bn-BD':'en-BD', maximumFractionDigits 0 unless fractional); lakh grouping in both.
### 3d Action patterns (drawer vs page vs modal)
- ?view= RecordDrawer (components/data-table/record-drawer.tsx): students, sms log, staff (confirmed by ?view= URLs); notice-drawer exists too.
- Modal (components/modal.tsx, a11y-deficient): classes add, exams new, leave request, grace time, office hour, machine, subject list.
- Inline <details> AddDetails: elsewhere. Full page /new: students/new, employees/new, notices/new. Row actions: RowActionPill / row-menu / row-more / "View" link variants coexist.
Standard: create = page for >6 fields (students, employees), else drawer; edit/view = RecordDrawer; confirm = ConfirmDialog; retire Modal and AddDetails in favour of a single Drawer with focus management.
### 3e Page header patterns
h1 present once on all 77 pages; subtitle absent on all; tab strips differ (exam nav, fee nav, sms nav, attendance tabs are four separate implementations: components/ui/section-tabs.tsx vs ad-hoc `nav.flex-nowrap overflow-x-auto`); breadcrumb present; primary CTA position varies (header right on exams/classes/fees, below filters on notices/staff). document.title = "EdumeBD" on all 77 pages.
### 3f Empty states
"No records", "No X yet", "No X.", "This list is empty", "No dues this month", "কোনো X নেই।" (with full stop in corrections). components/ui/states.tsx EmptyState exists but is used inconsistently; fees/assets and fees/vouchers show "No categories yet" twice plus "This list is empty".
### 3g Status colours
Seen: green=paid/present, amber (#c98a00) = pending/not checked in (2.74:1 on #fff6e0), red (#dc2626) = approvals pending (4.17:1), sky (#0077b8 on soft, 4.37:1). Status always accompanied by text (no colour-only badge found); only icon-only dot is notification bell dot (no text alternative beyond bell label). Standard: Badge component (components/ui/badge.tsx) with tone prop: success/warning/danger/info/neutral using *-deep tokens >=4.5:1.

## 4. Accessibility
- document.title is "EdumeBD" on every page (WCAG 2.4.2) - set via metadata in each route / template `%s | EdumeBD`.
- Skip link is the 24th focusable element: first Tab lands on "Collapse sidebar", then 22 nav items; 32 tab stops before first element in <main> (kb: firstMainIdx 32 on dashboard/attendance-mark/fees/sms/exams; students list has no main stop within 45 tabs). Root: skip link rendered after <aside> in components/app-shell.tsx:~414.
- Modal (components/modal.tsx, 7 consumers): role=dialog aria-modal=true but no focus move on open (focus stays on trigger), no focus trap, no Escape handler (stays open after Esc), no aria-label/labelledby. Palette (Ctrl+K) and profile popover are fine (focus enters, Esc closes).
- Form controls without accessible name (axe `label` critical, 12 pages/40 nodes + my scan): students/new + employees/new (DOB date input and a text input), attendance + attendance/mark (date), attendance/book + student-log/[id] (month), grace-time (from/to), sms compose textarea, sms/rules (2 number inputs), notices/new (title + body), institute/checklist (start/end), fees/ledger (from/to), student profile combobox.
- Heading order: h1 -> h3 skip on 12 pages (students/new, employees/new, student & employee detail, employee attendance, leave pages, grace-time, off-days, exam detail, checklist).
- ARIA structure: role=grid calendar without rows (employee attendance, employee attendance detail, off-days; critical, calendar-shell.tsx); <dl> with bad children on student & employee profile (13/86 nodes); empty <th> on 3 tables (employees/archive, leave/student, leave/employee); scrollable table not focusable (attendance/book).
- Contrast (axe, light, 1440 en): sidebar nav label #767676 on #f8f6fe = 4.24 (59 pages); header search placeholder 4.13 (37 pages); table <th> 4.13 (14 pages); sun-deep text on sun-soft 2.38-2.74; alert 4.17; sky 4.37. Token: --color-muted #767676 (app/globals.css:16) on tinted surfaces.
- Contrast (dark, 1440 bn): lang switch active "বাং" white on #7f63ff = 4.09 (74 pages); active nav item brand-700 #5a37e8 on #1a1430 = 2.65 (48 pages); brand-600 links 2.98-3.52; muted 2.67-3.73; red-600 delete 3.78.
- Keyboard: focus ring present on all but 4 of ~270 sampled stops; no ring on class/month/section comboboxes (attendance mark, fees x2, exams); no keyboard trap observed; tab walk reaches dialogs only via Modal fix above.
- Images: no <img> without alt found (imgsNoAlt empty on all pages); hidden base-ui select inputs flagged by script are aria-hidden (false positive).
- Reduced motion: only 2 prefers-reduced-motion rules in CSS vs 407 elements with transitions and 34 animating at rest.
- Hard-coded English aria-labels (see section 2).

## 5. Performance / stability (dev server)
- Load event median 5.7s, max 36.7s (/students/[id], /students/archive 35.5s, /students/new 25s, fees/ledger 23.8s, sms/log 23.6s) - dev compile inflated, but re-measure on a prod build.
- Console: only warning is Next image LCP "edumebd-logo.png ... add loading=eager" (50 pages en, 10 mobile); two ERR_INCOMPLETE_CHUNKED_ENCODING entries (student transfer page, mobile run); no errors, no hydration warnings on any page.
- CLS: 0.067 on 13 list pages (students, employees, attendance*, exams, approvals), 0.08 on students/archive, 0.039 on dashboard (shifts from the topbar search button and svg); all < 0.1 (good).

## 6. Per-page issue matrix
Universal on every page (shared chrome): title "EdumeBD", skip link late, 36px avatar, 20px breadcrumb links, 11/10px footer/nav text, dark-mode nav/lang contrast, light-mode sidebar contrast, English aria-labels. Page-specific columns below (full table in matrix.md).

| page | tap<40 (390) | clipped h1 | latin digits (bn) | unlabeled ctrls | h-order | aria/struct | CLS>.05 |
|---|---|---|---|---|---|---|---|
| /school | 7 | 0 | 1 | 0 | 0 | 0 | 0 |
| /school/activity | 27 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/approvals | 697 | 0 | 0 | 0 | 0 | 0 | 1 |
| /school/profile | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/my-classes | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/students | 103 | 0 | 1 | 0 | 0 | 0 | 1 |
| /school/students?view=ID | 107 | 0 | 4 | 0 | 0 | 0 | 1 |
| /school/students/new | 33 | 0 | 9 | 9 | 1 | 0 | 0 |
| /school/students/archive | 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/students/logins | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/students/subject-assignment | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/students/ID | 8 | 1 | 2 | 1 | 1 | 2 | 1 |
| /school/students/ID/transfer | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/employees | 50 | 0 | 10 | 0 | 0 | 0 | 1 |
| /school/employees/new | 16 | 0 | 0 | 12 | 1 | 0 | 0 |
| /school/employees/archive | 14 | 0 | 0 | 0 | 0 | 1 | 0 |
| /school/employees/ID | 6 | 0 | 2 | 0 | 1 | 2 | 0 |
| /school/employees/ID/attendance | 6 | 0 | 3 | 0 | 1 | 2 | 0 |
| /school/classes | 21 | 0 | 2 | 0 | 0 | 0 | 0 |
| /school/classes/archive | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/classes/routine | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/classes/syllabus | 186 | 0 | 0 | 0 | 0 | 0 | 1 |
| /school/attendance | 7 | 1 | 15 | 1 | 0 | 0 | 1 |
| /school/attendance/mark | 7 | 1 | 15 | 1 | 0 | 0 | 1 |
| /school/attendance/book | 8 | 0 | 39 | 1 | 0 | 1 | 1 |
| /school/attendance/student-log | 66 | 0 | 1 | 0 | 0 | 0 | 1 |
| /school/attendance/student-log/ID | 7 | 0 | 0 | 1 | 0 | 0 | 0 |
| /school/attendance/leave/student | 290 | 0 | 15 | 0 | 1 | 1 | 1 |
| /school/attendance/employee/office-hour | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/attendance/employee | 12 | 0 | 0 | 0 | 1 | 2 | 0 |
| /school/attendance/leave/employee | 20 | 0 | 3 | 0 | 1 | 1 | 0 |
| /school/attendance/off-days | 16 | 0 | 1 | 0 | 1 | 2 | 0 |
| /school/attendance/machine | 19 | 0 | 7 | 0 | 0 | 0 | 0 |
| /school/attendance/machine/students | 285 | 0 | 40 | 0 | 0 | 0 | 1 |
| /school/attendance/machine/employees | 16 | 0 | 21 | 0 | 0 | 0 | 0 |
| /school/exams | 74 | 1 | 1 | 0 | 0 | 0 | 1 |
| /school/exams/ID | 11 | 1 | 0 | 0 | 1 | 0 | 0 |
| /school/exams/ID/marks-entry | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/routine | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/seat-plan | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/admit-cards | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/result-book | 8 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/printables | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/promotion | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/cocurricular | 4 | 1 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/ID/attendance-sheet | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/cocurricular-items | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/combinations | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/exams/grading-schemes | 11 | 0 | 1 | 0 | 0 | 0 | 0 |
| /school/exams/result-inquiry | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/fees | 16 | 0 | 2 | 0 | 0 | 0 | 0 |
| /school/fees/assets | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/fees/bank | 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/fees/director-capital | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/fees/ledger | 9 | 0 | 7 | 2 | 0 | 0 | 0 |
| /school/fees/structures | 11 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/fees/vouchers | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/sms | 8 | 0 | 3 | 1 | 0 | 0 | 0 |
| /school/sms/buy | 10 | 0 | 4 | 0 | 0 | 0 | 0 |
| /school/sms/log | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/sms/log?view=ID | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/sms/rules | 17 | 0 | 2 | 6 | 0 | 0 | 0 |
| /school/notices | 23 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/notices/new | 7 | 0 | 0 | 3 | 0 | 0 | 0 |
| /school/notices/gallery | 6 | 1 | 1 | 0 | 0 | 0 | 0 |
| /school/questions | 33 | 0 | 8 | 0 | 0 | 0 | 0 |
| /school/attendance/employee/grace-time | 28 | 0 | 0 | 2 | 1 | 0 | 0 |
| /school/corrections | 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/questions/response | 9 | 0 | 3 | 0 | 0 | 0 | 0 |
| /school/institute | 20 | 0 | 1 | 0 | 0 | 0 | 0 |
| /school/institute/checklist | 35 | 0 | 1 | 2 | 1 | 0 | 0 |
| /school/institute/logistics | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/institute/templates | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| /school/institute/venues | 10 | 0 | 1 | 0 | 0 | 0 | 0 |
| /school/staff | 37 | 0 | 2 | 0 | 0 | 0 | 0 |
| /school/staff?view=new | 38 | 0 | 2 | 0 | 0 | 0 | 0 |

## 7. Best version - single standards (root cause -> fix -> pages)
1. Chrome tap targets: apply ICON_BUTTON (min 44) to profile avatar (app-shell.tsx ~476), BackLink (back-link.tsx), Pager cells (pager.tsx:46 -> h-11 on mobile / h-8 sm:), breadcrumb links (py-3 hit area), row checkboxes (label wrapper 44px). Pages: all 76.
2. Overlay primitive: replace components/modal.tsx and AddDetails with one accessible Drawer/Dialog (base-ui Dialog is already a dependency): focus on open, trap, Escape, aria-labelledby, return focus. Pages: classes, exams, attendance/leave, grace-time, office-hour, machine, subject list.
3. Skip link first in DOM (move before <aside> in app-shell.tsx:414) and unique `%s | EdumeBD` titles per route (generateMetadata/ title template). Pages: all.
4. Field primitive: all inputs through components/ui/field.ts/input.tsx requiring `label` (aria-label fallback). Pages: students/new, employees/new, attendance*, grace-time, sms, sms/rules, notices/new, institute/checklist, fees/ledger, student profile.
5. Format helpers lib/format.ts: formatDate/formatDateTime/formatNumber/formatTaka/formatPercent all lang-aware (bn-BD digits, same grouping, 12h time with localized AM/PM); lint-ban bare toLocale*String in app/ . Pages: ~25 files (list in section 2/3).
6. Tokens: --color-muted to #6b6b6b on tinted surfaces (>=4.5), dark brand-600/700 text tokens lightened (>=4.5), lang-switch active uses brand-600 bg, sun-deep/alert text darker. 
7. Type floor: bottom nav 12px, Powered-by 12px, badges 12px.
8. i18n glossary (lib/i18n.ts): fix one term per concept (table 3a), sentence case, ban literal placeholders, translate aria-labels (Open/Close menu, Visit EdumeBD, Notifications), enum labels on approvals.
9. Headings: Section titles h2 (Identity etc. in profile/new forms), calendar-shell role=grid with rows, dl wrappers, th text for action columns.
10. Mobile: add scroll-fade/affordance to horizontal sub-navs and make table scrollers tabIndex=0 with aria-label.

### Scores (1-5): current -> proposed
| Dimension | Current | Proposed |
|---|---|---|
| Consistency | 2.5 | 4.5 |
| Mobile fit (no overflow, bottom nav ok, but small targets/fonts) | 3.5 | 4.5 |
| Accessibility | 2.5 | 4.5 |
| Bangla quality | 3 | 4.5 |

## 8. Findings with jev validation
jev (mcp__jev__jev_verify) run in 3 batches; claim + evidence recorded in the calls (raw numbers cited in sections 1-5).
| # | Claim | jev |
|---|---|---|
| F1 | Modal keeps focus on trigger and ignores Escape (exams + classes, desktop and 390) | verified 0.99 / 0.85 |
| F2 | document.title identical on all 77 pages | verified 0.99 |
| F3 | Ledger money Latin digits vs fees list Bangla digits | verified 0.96 |
| F4 | "ঠিক N দিনের নিয়ম" placeholder in bn | verified 1.0 |
| F5 | First Tab is Collapse sidebar, skip link after nav (original 24th-element wording contradicted 0.37 as imprecise; reworded) | verified 0.72 (review) |
| F6 | #767676 on #f8f6fe 4.24 on 59 pages | verified 0.99 |
| F7 | Dark: active nav 2.65 (48 pages), lang switch 4.09 (74 pages) | verified 0.99 |
| F8 | No page-level overflow at 390/360 | verified 1.0 |
| F9 | Avatar 36x36 (59), breadcrumb 54x20 (46) | verified 0.99 |
| F10 | 11px nav labels / 10px Powered by on all 66 mobile pages | verified 0.95 |
| F11 | Unlabeled sms textarea, date inputs (axe label critical) | verified 1.0 |
| F12 | toLocaleString() without locale in ledger; formatTaka hard-codes en-BD 2dp | verified 0.98 / 0.99 |
| F13 | Raw ISO dates with Latin digits in bn (sms/rules, checklist) | verified 0.84 |
| F14 | Attendance wording হাজিরা vs উপস্থিতি | verified 0.96 |
| F15 | Date formats differ across pages | verified 1.0 |
| F16 | 12 pages skip h1->h3 | verified 0.99 |
| F17 | Dark brand links 2.98-3.52 | verified 1.0 |
| F18 | Console: LCP warning only, no hydration warnings (my "only one error" wording was contradicted 0.93: there are 2 ERR_INCOMPLETE_CHUNKED_ENCODING entries; corrected) | verified 0.74 after correction |
Unvalidated by jev (measurement only): CLS values, load times, reduced-motion counts, role=grid/dl axe findings, term tables.

## 9. Counts by severity
blocker 0; major 8 (Modal a11y, unlabeled controls, skip link/tab order, identical page titles, contrast light+dark, money/date format drift in bn, tap targets in chrome, term inconsistency); minor 7 (type floor 10-11px, heading order, ARIA structure grid/dl/th, English aria-labels, clipped h1, no scroll affordance, reduced-motion); polish 4 (LCP eager, CLS 0.067, empty-state wording, abbreviation "বাং").
