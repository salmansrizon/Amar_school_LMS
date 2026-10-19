# Student portal audit, 2026-10-04

Branch `feat/student-portal-overhaul` at `b40c47b`. Read-only pass, dev server `next dev --webpack`, Bangla, as the seeded student (`s9001@test-a.students.invalid`, Test School A) and the owner. Viewports 390x844 and 1440x900. Screenshots are in the session scratchpad, not the repo. No write was submitted.

Companion: `implementation-plan.md`.

Evidence legend: **[B]** observed in the browser, **[C]** read from code, **[Q]** measured with a student-session Supabase query. Claims marked **verified** passed `jev_verify` (all six verified, confidence 0.88 to 0.99). Unmarked claims are direct browser or code observations not sent to jev. "review" marks low confidence.

---

## 1. The target: School Owner design language

Sources: `web/app/school/page.tsx`, `web/components/ui/widgets.tsx`, `web/components/ui/page.tsx`, `web/components/app-shell.tsx`, `web/components/school-shell.tsx`, `web/lib/school-nav.ts`, `web/components/ui/section-tabs.tsx`, `web/components/ui/states.tsx`, `web/components/upcoming-list.tsx`, `web/app/globals.css`, `docs/013_owner_ui_overhaul_map.md`.

### 1.1 Shell
- One `AppShell` for every role (`components/app-shell.tsx`). The shell owns the single `<main>`, gutters (`px-gutter pt-section pb-16`) and fluid width; pages render bare content. The student layout passes `contentContainer={false}`, so each student page owns its own `<main className="w-full max-w-3xl p-6">` and escapes the gutter and section tokens.
- Sidebar: desktop >= `lg`, `w-64` (collapsible to `w-20`, cookie). Items carry a `section`; the shell draws a collapsible section header, opens the section containing the active route, and wraps it in a dotted brand-300 box. Nav rows are `min-h-11 rounded-xl`, active `bg-brand-50 text-brand-700`.
- Phone: hamburger drawer (`w-72`) plus, for the owner only, a bottom tab bar `SchoolBottomNav` in `school-shell.tsx` (one tab per nav group, `min-h-14`, `text-[11px]`, label from `shortLabelKey`, `md:hidden`, passed as `bottomNav`). Theme and language switches live in the drawer below `sm`.
- Topbar: search palette (icon on phone, field from `md`), bell, avatar popover. The popover shows a Profile link only when `profile.href` is passed; the student layout does not pass it. [C]

### 1.2 Grid, spacing, type
- Tokens (`globals.css`): `--spacing-card` 20px (`p-card`), `--spacing-grid` 16px (`gap-grid`), `--spacing-section` 24px (`mb-section`), `--spacing-gutter` 20px, `--spacing-row` 40px.
- Stat row `StatGrid` = `grid-cols-2 gap-grid xl:grid-cols-4` (2 columns on phone, 4 from 1280px). Alert list `md:grid-cols-2 xl:grid-cols-3`. Lower row `lg:grid-cols-3`, main card `lg:col-span-2`. Forms `FormGrid` `sm:2 xl:3 2xl:4`.
- Type: page title `text-2xl font-extrabold`, card title `font-bold`, stat label `text-xs font-bold uppercase tracking-wider`, stat value `text-3xl font-extrabold`, notes `text-xs font-semibold`.

### 1.3 Card anatomy
- `StatCard`: `rounded-3xl`, tone gradient wash, ring, `min-h-36`, oversized cropped icon bottom-right at 25% opacity, label, value, toned note, one action link `label →`.
- `AlertStrip` ("needs attention"): white `rounded-2xl` card with a title; each alert is a tone-soft row with toned title, optional body and a pill action (`h-9`, `max-sm:h-11`). Renders nothing when empty.
- `QuickActions`: card of chips `h-11 rounded-xl`; the first is the brand-filled primary; optional count badge.
- `WorkflowCard`: `rounded-2xl` card, header row with brand icon, bold title, optional sun tag, bottom border, body.
- `Card` (`ui/page.tsx`): hairline `rounded-lg` card with optional 2px status rail (`tone`). `UpcomingList` rails each row (exam sun, holiday alert, class sky).
- `PageHeader`: crumbs, `h1`, date or count badge pill, actions, `backHref` (44px on phone). `SectionTabs`: route-based tab bar with optional count badge. `EmptyState`: titled card with one primary action (`h-11`). `WarningBanner`: one-line amber banner with one way out.

### 1.4 Colour and urgency
- Tones: brand (purple), mint (good, done), sun (soon, warning), alert (overdue, bad), sky (info), muted (nothing). `-deep` for text, `-soft` for fills; all flip in dark mode. Colour is never the only signal: every tone is paired with text.
- Urgency order on the owner home: the alert strip first (alert rows before sun rows, `buildDashAlerts`), then stat cards with conditional tone (attendance rate >= 85 mint else alert; subscription red in the last 7 days), then quick actions. Attendance bands from the map log: >= 90 / 75-89 / < 75.
- Tap targets `h-11` / `min-h-11` on phone for chips, nav rows and pills.

### 1.5 Tables and formats
- `DataTable` (`components/data-table/`) for record lists; `thClass`/`tdClass`/`trClass` for plain tables (header underline only, `h-row`). Formats go through `formatNumber`, `formatMoney`, `formatDate`, `formatTime` in `lib/i18n.ts` (Asia/Dhaka, Bangla digits).

### 1.6 Owner flaws not to copy
- The owner dashboard `<title>` is the bare "EdumeBD". Student pages have proper titles: keep them. [B]
- The "অনুমোদন ইনবক্স" count chip prints `343` in ASCII digits because `QuickActions.count` is not formatted. [B] Pass formatted counts in the student port.

---

## 2. The student portal as it is

### 2.1 Route inventory

| Route | Shows | Data source | Shared UI used |
|---|---|---|---|
| `/student` (`page.tsx`, `home-cards.tsx`, `day-plan.tsx`) | greeting, 3 identity cards, "N tasks pending" and "N new notices" pills, next exam, Today and Tomorrow routine, 3 latest notices, fee-due card (only if > 0) | `loadStudentRoutine`, `loadNoticeFeed`, `loadStudentTasks`, `student_fee_record`, `student_exam_routine` | none from `components/ui` |
| `/student/routine` (+ `print`) | weekly grid (day cards on phone), today highlighted | `student_routine`, `off_days`, `central_off_days` | none |
| `/student/notices`, `[id]` | feed, urgent first, unread badge; detail marks read and has an ask form | `publications`, `student_publication_reads` | none |
| `/student/tasks`, `[id]` | homework in 4 piles; detail has upload and tick | `publications kind=homework`, `student_task_completions`, `homework_submissions` | none |
| `/student/materials` | syllabus and lesson files | `student_material` | none |
| `/student/results`, `[examId]` (+ `print`) | published exams; detail GPA, grade, pass, rank, marks table | `student_exam_result`, RPC `student_exam_rank`, `student_subject_option`, `grading_schemes` | none |
| `/student/exams`, `[examId]/admit-card` | schedule per exam, seat, admit card | `student_exam_routine`, `student_seat_assignment` | none |
| `/student/attendance` | month %, present, absent, month grid | `attendance_records`, `student_leaves`, `off_days`, `central_off_days`, RPC `student_absent_working_days` | none |
| `/student/leave` | request form on top, list below with withdraw | `student_leaves` | none |
| `/student/fees` (+ `print`) | 4 totals, month table | `student_fee_record` | none |
| `/student/questions` | ask form on top, own questions with replies | `student_messages`, `publications`, `student_subject_option` | none |
| `/student/profile` | own record, photo, correction form and history | `student_self`, `student_profile_change_requests` | none |
| `/student/notifications` | bell inbox | `notifications` | none |

Only `combobox-field` (two forms) is imported from `components/ui`. Nothing uses `PageHeader`, `Card`, `StatCard`, `AlertStrip`, `WorkflowCard`, `QuickActions`, `SectionTabs`, `EmptyState`. [C]

Server actions that must not change: `requestLeave`, `withdrawLeave` (`lib/student/leave-source.ts`), `askQuestion` (`messages-source.ts`), `recordSubmission`, `withdrawSubmission` (`submissions-source.ts`), `markPublicationRead` (`notices-source.ts`), task toggle (`tasks-source.ts`), correction request (`corrections-source.ts`).

### 2.2 What a student can read (probed with a student session) [Q]

| Source | Readable? | Notes |
|---|---|---|
| `student_self` | yes | name, student_no, roll, class_name, section |
| `student_exam_result` | yes (1 row) | raw marks present: XS1 Physics 72 of 100; `grading_scheme_id` is null for this exam |
| `grading_schemes`, `grade_bands` | **no, 0 rows** | issue #702; `exams` also returns 0 rows |
| RPC `student_exam_rank` | **yes** | returned rank 1 of 1; the page shows it only when a scheme loads |
| `student_fee_record` | yes (1 row) | pay, fine, due per month; `fee_structures` closed (ADR 0015) |
| `student_leaves` | yes (0 rows for this student) | |
| `student_messages` | yes (9 rows) | status, reply_body, replied_at |
| `publications` | yes (notice, homework) | `importance`, `due_at` present |
| `student_routine`, `student_exam_routine`, `student_seat_assignment`, `student_material`, `attendance_records`, `notifications`, `homework_submissions`, `student_profile_change_requests` | readable, 0 rows for this student | code paths exist, not exercised with data |
| `off_days` | yes (2 rows) | usable for "holiday soon" |
| RPC `student_absent_working_days(start,end)` | yes | returned 4 for 1-4 Oct |
| `students`, `employees`, `fee_structures` | no | by design |

Consequence: no dashboard tile may depend on `grading_schemes`, `grade_bands`, `exams`, `students`, `employees` or `fee_structures`. A result tile can use raw marks and rank.

Test-data limits: the seeded class has no routine, exam schedule or attendance, and one fully paid fee row, so the home routine, exam and fee-due blocks only showed empty states. Their populated states are verified from code, not browser (review).

### 2.3 Current menu
12 flat items, no groups: Home, Routine, Notices, Tasks, Study Material, Results, Exams, Attendance, Leave, Fees, Questions, My Profile (`app/student/layout.tsx`). Desktop: ungrouped sidebar, all 12 visible. Phone: hamburger drawer only (12 links of 44px). No bottom bar, no sibling tabs between related pages, no Profile in the avatar menu. Order puts Study Material above Attendance, Leave and Fees.

---

## 3. Findings, ranked by impact on a phone student (jev_rerank order)

Rank is `jev_rerank` relevance. jev scored finding 13 last, but a wrong attendance figure is a correctness defect with a one-line read-side fix, so the plan schedules it in the first page package anyway.

### 1. Result detail is a dead end (0.91) [B] verified
The list shows "UAT3 Exam 1773432026 | 1 বিষয়". Opening it shows an empty marks table and "এখনো কোনো ফলাফল প্রকাশ করা হয়নি।". `/print` returns the 404 page. The student can read the raw marks and the rank. Cause: #702 (out of scope), plus `exam.gradingSchemeId ? load : null` (the id is null for this exam). Fix: show raw marks and rank when the scheme is unavailable. Three taps from home to reach a contradiction.

### 2. Home has no "needs me now" (0.87) [B][C]
Home shows a "N tasks pending" pill when overdue plus due-soon > 0, a "N new notices" pill, and a fee card only when due > 0. No urgency order, no exam countdown, no leave status, no named overdue item, no attendance.

### 3. Phone navigation is 12 flat items behind a hamburger (0.86) [B] verified
Every destination costs hamburger plus item (2 taps) and a scroll of 12 rows. Related pages (Tasks, Routine, Questions; Attendance, Leave; Exams, Results) are not linked to each other. The shell supports `bottomNav`; the student layout does not use it.

### 4. Submitted homework still counts as overdue (0.78) [C] verified
`recordSubmission` only inserts into `homework_submissions`; `bucketFor` ignores `task.submitted`; `pendingCount = overdue + dueSoon`. A student who uploaded but did not tick "done" stays red. Fix in a new pure helper; `bucketFor` and `splitTasks` unchanged.

### 5. Identity cards bury the content (0.75) [B] verified
At 390px the three identity cards (student no, class, roll) occupy y=165 to 422 of 844 (about 30%) before Today and Tomorrow, which were each an empty-state paragraph. Identity belongs in the header subtitle and on the profile page.

### 6. Home shows no urgency for notices (0.68) [C]
The notices list marks urgent with a badge; the home card lists the 3 newest with an unread dot, no urgency, and disappears when empty.

### 7. Urgency is not coloured on Fees, Exams, Tasks (0.59) [B][C]
Fees: four neutral cards (`৳১ মোট ধার্য | ৳১ জমা | ৳০ জরিমানা | ৳০ মোট বকেয়া`), no tint, no emphasis on an overdue month. Tasks use coloured heading text only. No tone washes or status rails.

### 8. Leave form precedes the list; status is a small pill (0.53) [B][C]
Leave status is not visible from home; a student checking "was it approved" scrolls past the form.

### 9. Tap targets under 44px on phone (0.51) [B]
At 390px: task title link 140x20, done toggle 92x26, attendance month links 79x20 and 72x20, "সব দেখুন" 44x16. Shell controls pass.

### 10. No shared header, wrong width, no Profile in avatar menu (0.51) [B][C]
Pages use `<main className="w-full max-w-3xl p-6">` and an `h1`: no crumbs, no back link (results detail hand-rolls one), no date badge, no owner gutters. On desktop the home content stops at about x=1175 of 1440. `profile.href` is not passed, so the avatar popover has no profile entry.

### 11. Formats and digits inconsistent (0.50) [B][C] verified (formatters)
No student file uses `formatDate`, `formatMoney`, `formatNumber` or `formatTime`; 13 files call `toLocaleDateString` or `toLocaleString`. Observed: roll "১" on home but "1" on profile; "1 বিষয়"; exam year "2026" ASCII; rank and marks raw; exam `start_time` printed raw on home and exams. Dates use browser or UTC rather than Asia/Dhaka.

### 12. Questions: form first, answered and waiting mixed (0.27) [B][C]
Newest first; waiting questions are a muted "উত্তরের অপেক্ষায়" line; no unanswered count anywhere else. With 9 questions the ask form's result list is long.

### 13. Attendance headline is wrong mid-month (0.26) [B][Q] verified
On 4 Oct: "০% উপস্থিতির হার", "০ উপস্থিত", "৩১ অনুপস্থিত কার্যদিবস". The RPC is called with `p_end` = month end, so future days count as absent (1-4 Oct returns 4). A caveat line sits below, but the headline numbers are wrong. Fix: use `min(monthEnd, today)` for the current month.

### Other observations
- All student pages have proper page titles (keep).
- Both shells scroll inside `#app-content`; no horizontal scroll at either viewport; one `<main>` per page.
- Empty states are plain muted paragraphs without an action link; the shared `EmptyState` requires one.

---

## 4. Journeys today

| Journey | Taps from home (phone) | Dead ends and gaps |
|---|---|---|
| What do I have to do today | 1 (pill, only if > 0) else 2 plus scroll | no list on home; pill hidden at zero; submitted-but-unticked counts as pending |
| What is due or overdue (tasks, fees, leave, questions) | 2 per page, four pages | no single view; fee card only if due > 0; leave and question state invisible |
| Today's routine | 0 (home card) if published | empty state without action; Tomorrow takes equal space |
| Attendance this month | 2 | wrong headline (13); 0% when the school has not taken attendance |
| Latest result | 3 (home, menu, results, detail) | detail empty, print 404 (1) |
| Pay or see my fee | 2 (1 if due card shown) | statement only; no overdue-month emphasis; no receipts (by design) |
| Ask for leave | 2 | form first; status elsewhere |
| Read a notice | 1 from home card | no urgency on home; back path is the drawer |
