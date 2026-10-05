# Student portal redesign: implementation plan

Companion to `audit.md` (same folder). Target: the School Owner design language (see audit section 1). All paths are under `web/` unless stated.

## 0. Constraints and how the plan respects them

- **No migration, no RLS change, no server-action change, no existing function replaced.** Every task is read-side or presentation. New pure helpers go in new files; `bucketFor`, `splitTasks`, `pendingCount`, `totalFees`, `planFor`, `nextPaper`, `attendancePercent` etc. stay as they are.
- **All current student URLs keep working.** The menu is reorganised, no route is moved or removed, so no redirects are needed.
- **Reuse.** Owner components: `PageHeader`, `Card`, `StatCard`/`StatGrid`, `AlertStrip`, `QuickActions`, `WorkflowCard`, `WarningBanner`, `ProgressBar` (`components/ui/widgets.tsx`, `components/ui/page.tsx`), `SectionTabs`, `EmptyState`, `UpcomingList`, `AppShell`. Tokens `p-card`, `gap-grid`, `mb-section`, `px-gutter`. Formatters `formatMoney`, `formatDate`, `formatTime`, `formatNumber`.
- **Bangla first.** Every new string has bn and en and reuses existing student-portal terms (listed in section 7).
- **Phone first.** Each screen is specified at 390px and at >= 1024px.
- **Dialogs** through `components/native-dialog.tsx` (existing).

## 1. Menu

### 1.1 Current
Home, Routine, Notices, Tasks, Study Material, Results, Exams, Attendance, Leave, Fees, Questions, My Profile (12 flat items, hamburger only on phone).

### 1.2 Proposed: 5 groups, same as the owner's group model
`SCHOOL_NAV_GROUPS` makes one bottom tab per group and one sidebar section per group. The student gets the same shape.

| Phone tab (short label) | Sidebar section (desktop) | Items, first is the tab's landing page |
|---|---|---|
| হোম / Home | সংক্ষিপ্ত / Overview | Home `/student` |
| পড়াশোনা / Study | পড়াশোনা / Study | Tasks `/student/tasks`, Routine `/student/routine`, Study Material `/student/materials`, Questions `/student/questions` |
| পরীক্ষা / Exams | পরীক্ষা ও ফলাফল / Exams & Results | Exams `/student/exams`, Results `/student/results` |
| হাজিরা / Attendance | উপস্থিতি ও ছুটি / Attendance & Leave | Attendance `/student/attendance`, Leave `/student/leave` |
| ফি ও নোটিশ / Fees & Notices | ফি ও নোটিশ / Fees & Notices | Fees `/student/fees`, Notices `/student/notices` |

My Profile leaves the main menu: it moves to the avatar popover (pass `profile.href='/student/profile'` to `AppShell`, which already renders the Profile link when `href` is set). Notifications stay on the bell. Result: 5 tabs on a phone, 11 destinations on desktop in 5 collapsible sections, 1 tap to any group, 1 more tap to a sibling through `SectionTabs`.

Why these groups: (1) what a student does each day (tasks, routine, ask) is one group; (2) exams and results are one mental model; (3) attendance and leave are the same question ("was I there, and was my absence excused"); (4) money and school announcements are the school talking to the family, as the owner's "Finance & Communication" group does; (5) Home is the only item that needs one tap. The tab order follows daily frequency. Tab landing pages: Study lands on Tasks because "what do I have to do" is the first question; Exams lands on Exams (schedule first, results second) except when a result was published in the last 7 days, then the tab links to Results (optional, see open decision D5).

### 1.3 Mapping table

| Old item | Now lives at | Reach on phone | Reach on desktop |
|---|---|---|---|
| Home | Home tab | 1 tap | Overview section |
| Routine | Study group, tab 2 | Study tab then "রুটিন" tab; also home "Today" card | Study section |
| Notices | Fees & Notices group, tab 2 | tab then tab; also home "Latest notice" card (0-1 tap) | Fees & Notices section |
| Tasks | Study group, tab 1 (landing) | 1 tap; also home alert | Study section |
| Study Material | Study group, tab 3 | 2 taps | Study section |
| Results | Exams group, tab 2 | 2 taps; also home Result card (1 tap) | Exams & Results section |
| Exams | Exams group, tab 1 (landing) | 1 tap | Exams & Results section |
| Attendance | Attendance group, tab 1 (landing) | 1 tap; also home stat card | Attendance & Leave section |
| Leave | Attendance group, tab 2 | 2 taps; also home quick action | Attendance & Leave section |
| Fees | Fees & Notices group, tab 1 (landing) | 1 tap; also home stat card | Fees & Notices section |
| Questions | Study group, tab 4 | 2 taps; home quick action | Study section |
| My Profile | avatar popover | 2 taps (avatar, Profile) | popover and sidebar not needed |
| Notifications | bell (unchanged) | 1 tap | bell |

### 1.4 Rendering
- **Phone (< `md`)**: bottom tab bar `StudentBottomNav`, markup copied from `SchoolBottomNav` (`min-h-14`, `text-[11px]`, safe-area padding, `aria-current`, label from `shortLabelKey`), passed to `AppShell` as `bottomNav`. A group is active when the path matches any item in it (longest prefix, as `navGroupFor`). The hamburger drawer stays (it lists all 11 items grouped, plus theme and language below `sm`) so nothing is only reachable through the tab landing pages. Tabs show a count dot/number only for group Study (tasks overdue + due soon) and Fees & Notices (fee due or unread notices), from the same counts the home uses (kept cheap: see D6).
- **Desktop (>= `lg`)**: `AppShell` sidebar with `section` on every item (the shell already handles collapsible sections and the active-section highlight). Same top bar. Sidebar footer CTA: none.
- **Between related pages**: each group page starts with `SectionTabs` (`components/ui/section-tabs.tsx`) built from the group's items, with count badges (Tasks pending, Questions waiting, Notices unread). On phone this is a horizontally scrolling tab bar under the page header; on desktop the same.
- **Search palette**: `STUDENT_SEARCH` stays (all 12 entries keep working); entry order follows the group order.
- Considered and rejected: a generic `BottomTabBar` extracted from `SchoolBottomNav`. It would modify the owner shell and risk regressions on the owner's phone UI; leave extraction as a follow-up (D7).

New files: `lib/student-nav.ts` (groups, items, `studentGroupFor(pathname)`, `studentGroupTabs(group, counts)`), `components/student-shell.tsx` (client; `StudentBottomNav` plus the thin `AppShell` adapter, mirroring `school-shell.tsx`).

## 2. Home dashboard (`/student`)

Modelled on `app/school/page.tsx`: header, "needs attention" strip, 4 stat cards, quick actions, then a `lg:grid-cols-3` lower row. All blocks are server-rendered from one `Promise.all`. Reused loaders: `loadStudentTasks`, `loadStudentRoutine`, `loadNoticeFeed`, `student_fee_record` + `totalFees`/`sortFees`, `student_exam_routine` + `nextPaper`, `student_leaves`, `student_messages`, `student_exam_result` + `groupByExam`/`missingSubjects`, RPC `student_exam_rank`, RPC `student_absent_working_days`, `attendance_records`, `off_days`.

A new pure module `lib/student/dashboard.ts` (WP-B) holds the urgency arithmetic and is unit tested; the page only fetches and lays out. It follows `lib/dashboard.ts` (`buildDashAlerts`, `attendanceToday`) which was considered and cannot be reused because it is owner-shaped (grants, SMS, approvals).

### 2.1 Date rules (school day = Asia/Dhaka, `schoolToday()`)
- `due_at` is a timestamp. Compare in the school calendar: due day = date of `due_at` in Asia/Dhaka. Overdue = due day < today. Due soon = due day within today..today+2 (urgent horizon 2 days; the existing tasks page keeps its 7-day "due soon" pile, so the alert says "due in 2 days" only for <= 2).
- Display dates through `formatDate`, times through `formatTime`/`formatNumber`; money through `formatMoney`.

### 2.2 Blocks, top to bottom

**B0. PageHeader**
- Title: student full name (`student.full_name`). Crumb: `student.nav.home` (single crumb like the owner's "Dashboard"). Subtitle: `{class} - {section} · রোল {roll} · {student_no}` (replaces the 3 identity cards, formatted with `formatNumber` for roll; student number is an identifier, printed as is). Badge: today's date, `Intl` weekday + day + month in Bangla (same call the owner uses).
- Read-only notice (expired subscription): `WarningBanner` instead of the current ad hoc paragraph: label `student.readOnlyLabel`, text existing `student.readOnly`, no link needed (use `href='/student/fees'`, label existing `student.nav.fees`).
- Phone: full width. Desktop: same.

**B1. AlertStrip "এখনই যা করতে হবে" (needs me now)**
- Purpose: everything pending, ordered by urgency. Source: `buildStudentAlerts()` in `lib/student/dashboard.ts` fed with tasks, fees, exam routine, notices, leaves, messages.
- Rows, in this order (alert tone first, then sun, then sky; within a tone, earliest date first); max 6 rows, then the strip's last row "আরও দেখুন" is not needed because every row links to its page:
  1. **alert** `N টি কাজ সময় পেরিয়ে গেছে` / body: title of the oldest overdue task (+1 more). Overdue = due day < today, not ticked done, and not handed in (a submission counts as handled; the tick alone also counts as handled). Link `/student/tasks`, action label `student.alertOpen` ("খোলো").
  2. **alert** `বকেয়া ৳X` when any fee month before the current month has `due_amount > 0` (body: oldest month, `formatDate`-style month label). Link `/student/fees`.
  3. **alert** `আজ পরীক্ষা` when the next exam paper is today (body: subject, time with `formatTime`-style rendering of `start_time`, room). Link `/student/exams`.
  4. **alert** urgent notice unread (`importance = 'urgent'`, not in `unread`-excluded set): title of the notice. Link `/student/notices/[id]`.
  5. **sun** `N টি কাজ ২ দিনের মধ্যে জমা` (due today..+2). Link tasks.
  6. **sun** `বকেয়া ৳X` when the only due is the current month. Link fees.
  7. **sun** exam in 1 to 3 days (body: subject, date). Link exams.
  8. **sun** leave request rejected within the last 7 days (body: dates). Link leave.
  9. **sun** attendance this month below 75% (only when records exist). Link attendance.
  10. **sky** leave request pending (body: dates). Link leave.
  11. **sky** question waiting for an answer for more than 24 hours (reuse `WAITING_WARN_HOURS` from `lib/student/hub.ts` and `isAnswered` from `lib/student/messages.ts`; body: subject). Link questions.
  12. **sky** `N টি নতুন নোটিশ` (unread, non-urgent). Link notices.
- Empty state (no rows): the strip renders nothing, which for a student would read as a bug, so the page renders a single `Card tone="mint"` with text `student.allClear` ("আজ কিছু বাকি নেই") and two inline links (Tasks, Routine). This is page code, no new component.
- Phone: one column list, each row's action pill `max-sm:h-11` (the component already does this). Desktop: `md:grid-cols-2 xl:grid-cols-3` as in the owner strip.

**B2. StatGrid (4 cards)** (`grid-cols-2 xl:grid-cols-4`, same as the owner)
1. **Attendance this month.** Source: `attendance_records` (present dates in `[monthStart, today]`) and RPC `student_absent_working_days(p_start=monthStart, p_end=today)` (the end is today, not month end: fixes audit finding 13); `attendancePercent`. Value `formatNumber(percent)%`. Tone by owner bands: >= 90 mint, 75 to 89 sun, < 75 alert. Note: `{present} / {present+absent} দিন`. Empty (no present records): value "—", tone muted, note `student.attNoRecords` (existing). Link `/student/attendance`, label `student.alertOpen`... use existing `dash.attendanceReport`. 
2. **Fees.** Source: `student_fee_record`, `totalFees(sortFees(...))`. Value `formatMoney(due)`. Tone alert if a past month has due, sun if only the current month has due, mint if due is 0. Note: `{n} মাসের বকেয়া` or `সব পরিশোধ` (`student.allPaid`). No rows: muted "—", note `student.noFeeRecord`. Link `/student/fees`, label existing `student.nav.fees`... use `student.viewFees`.
3. **Homework.** Source: `loadStudentTasks` + new `dashboardTaskCounts` (overdue, dueSoon within 2 days, excluding done and handed-in). Value: pending count (overdue + due within 2 days), `formatNumber`. Tone alert if overdue > 0, sun if only due-soon, mint if 0 (note `student.noTasks`, existing "এখন কোনো কাজ নেই।"). Note: `{n} টি সময় পেরিয়েছে`. Link `/student/tasks`.
4. **Latest result.** Source: `student_exam_result` (`groupByExam`, pick the newest published by `results_published_at`), `missingSubjects` with `student_subject_option`, RPC `student_exam_rank`. Behaviour while grading is unreadable (#702 and the null-scheme case): the block never calls `grading_schemes`; it shows **raw total** `obtained / full` (sum of `subjectObtained`, `subjectFullMarks`, `formatNumber`) with note `{exam name} · মেধাক্রম {rank} / {out_of}` when no subject is missing and the rank RPC returned a row. Missing subjects: value "—" and note `exams.incomplete` (existing term). No GPA, grade or pass/fail here. When the scheme becomes readable later, the same card can add the grade (guarded by `scheme != null`); this is not built now. No published result: muted "—", note existing `student.noResults`. Tone brand (sky when no result). Link `/student/results/[examId]` (which also gets the raw-marks fallback, see section 4.4). Needs no `exams` or `grading_schemes` read.

Each card: `icon` from `school-icons` (`attendance`, `fees`, `classes`, `exams`), `action` link as in the owner (`label →`).

**B3. QuickActions "আজকের দ্রুত পদক্ষেপ"**
Chips (`h-11`): primary **ছুটির আবেদন** (`/student/leave#new-leave`), **প্রশ্ন করো** (`/student/questions#ask`), **বাড়ির কাজ** (`/student/tasks`, with the pending count in the label, because `QuickAction.count` renders ASCII digits), **রুটিন** (`/student/routine`), **ফি** (`/student/fees`). Hidden: leave and ask chips when the subscription is expired (`isReadOnly`), because both forms are disabled then. Phone: chips wrap (flex-wrap, as the owner). Desktop: one row.

**B4. Lower row, `mt-section grid gap-grid lg:grid-cols-3`**
- **B4a (lg:col-span-2) WorkflowCard "আজকের রুটিন"** (icon `CalendarClock`). Source: `loadStudentRoutine(supabase, lang, [today, tomorrow])` and `todayAndTomorrow` (unchanged). Content: today's periods as rows (period number, subject, `teacher · room`) re-using the markup of `DayPlanCard` moved inside the card (refactor `day-plan.tsx` to export `PeriodList`/`EmptyDay` so the page does not duplicate it); below a divider one muted line for tomorrow ("আগামীকাল: N টি ক্লাস, প্রথমটি {subject}"). Empty states stay four-way (off day with label and the party icon, weekend, no routine published, no classes) with `student.noRoutine`. Footer link "সব দেখুন" to `/student/routine`. Phone: stacked first in the lower row. Desktop: left two columns.
- **B4b WorkflowCard "আসন্ন"** (icon `CalendarClock`, same card as above stacked in column 3 on desktop, below B4a on phone). Source: `UpcomingList` with `UpcomingItem[]` built in `lib/student/dashboard.ts` (`buildStudentUpcoming`): exam papers (`student_exam_routine`, kind `exam`, `href=/student/exams`), off days (`off_days`, kind `holiday`), homework due dates (kind `class` reused with detail "জমার তারিখ"; see D3), soonest first, `limit 6`. Empty: `upcoming.none` (existing).
- **B4c WorkflowCard "সর্বশেষ নোটিশ"** (icon `notices`). Source: `loadNoticeFeed(supabase, 30)` (already sorts urgent first). Up to 3 rows: urgent rows get the alert rail (`railClass('alert')`) plus the label `importanceLabel`, unread rows get the dot; date by `formatDate`. Footer: "সব দেখুন" `/student/notices`. Empty: existing `student.noNotices` (not hidden as today). Desktop: column 3 under B4b; phone: last.

### 2.3 Wireframes

Phone (390px). Bottom tab bar fixed under the scroll frame.

```
+--------------------------------------+
| [=] [search]            [bell] [SS]  |
+--------------------------------------+
| হোম                                  |
| Seed Student A     (রবি, ৪ অক্টোবর)  |
| Seed Class - A · রোল ১ · S9001       |
|                                      |
| +- এখনই যা করতে হবে ----------------+ |
| | [R] ২ টি কাজ সময় পেরিয়ে গেছে  [খোলো]|
| | [R] বকেয়া ৳৬০০                 [খোলো]|
| | [A] ১ টি কাজ ২ দিনের মধ্যে জমা  [খোলো]|
| | [B] ছুটির আবেদন অপেক্ষমাণ        [খোলো]|
| +-------------------------------------+ |
|                                      |
| +--------------+ +--------------+    |
| | উপস্থিতি     | | ফি           |    |
| | ৯২%          | | ৳৬০০         |    |
| | ১৮/২০ দিন    | | ১ মাসের বকেয়া|   |
| | হাজিরা দেখুন→| | ফি দেখুন →   |    |
| +--------------+ +--------------+    |
| | বাড়ির কাজ   | | সর্বশেষ ফল   |    |
| | ৩            | | ৭২ / ১০০     |    |
| | ২ টি পেরিয়েছে| | UAT Exam · ১/১|   |
| +--------------+ +--------------+    |
|                                      |
| আজকের দ্রুত পদক্ষেপ                   |
| [ছুটির আবেদন] [প্রশ্ন করো] [কাজ ৩]   |
| [রুটিন] [ফি]                          |
|                                      |
| +- আজকের রুটিন -------------------+ |
| | ১ গণিত  শিক্ষক · কক্ষ ২          | |
| | ২ বাংলা ...                       | |
| | আগামীকাল: ৫ টি ক্লাস              | |
| +-----------------------------------+ |
| +- আসন্ন -------------------------+ |
| | পরীক্ষা  ৮ অক্টো  গণিত            | |
| +- সর্বশেষ নোটিশ -----------------+ |
+--------------------------------------+
| [হোম] [পড়াশোনা] [পরীক্ষা] [হাজিরা] [ফি ও নোটিশ] |
+--------------------------------------+
R = alert (red) row, A = sun (amber), B = sky (blue)
```

Desktop (1440px, sidebar `w-64`, content `px-gutter`).

```
+---------+--------------------------------------------------------------+
| EdumeBD | [ search ... ⌘K ]                      [bell] [theme][bn|en] [SS]|
| হোম     |--------------------------------------------------------------|
| পড়াশোনা| হোম                                                            |
|  কাজ    | Seed Student A   (রবিবার, ৪ অক্টোবর ২০২৬)                       |
|  রুটিন  | Seed Class - A · রোল ১ · S9001                                |
|  উপকরণ  | +- এখনই যা করতে হবে ------------------------------------------+ |
|  প্রশ্ন  | | [R] ২ কাজ পেরিয়েছে [খোলো] | [R] বকেয়া ৳৬০০ [খোলো] | [A] ... | |
| পরীক্ষা  | +---------------------------------------------------------------+ |
| উপস্থিতি| +--------+ +--------+ +--------+ +--------+                    |
| ফি ও    | |উপস্থিতি| | ফি     | |বাড়ির  | |সর্বশেষ | (4 StatCards)      |
|  নোটিশ  | |৯২%     | |৳৬০০    | |কাজ ৩   | |ফল ৭২/১০০|                  |
|         | +--------+ +--------+ +--------+ +--------+                    |
|         | +- আজকের দ্রুত পদক্ষেপ --------------------------------------+ |
|         | | [ছুটির আবেদন] [প্রশ্ন করো] [কাজ ৩] [রুটিন] [ফি]               | |
|         | +---------------------------------------------------------------+ |
|         | +- আজকের রুটিন (col-span-2) ----------+ +- আসন্ন ------------+ |
|         | | ১ গণিত ... ২ বাংলা ...               | | পরীক্ষা ...         | |
|         | | আগামীকাল: ...                        | +- সর্বশেষ নোটিশ ---+ |
|         | +--------------------------------------+ | ...                 | |
+---------+--------------------------------------------------------------+
```

## 3. Journeys: current and proposed

| Journey | Current | Proposed | Delivered by |
|---|---|---|---|
| What do I have to do today | pill (if > 0) or 2 taps to Tasks | open app: B1 strip lists it, first row is the oldest overdue task; tap once to Tasks; all-clear card when none | B1, B2 card 3, WP-B |
| What is due or overdue | tasks, fees, leave, questions: 4 pages, 2 taps each | B1 is one list across all four, ordered by urgency; each row 1 tap | B1 |
| My routine today | home card if published; weekly page 2 taps | B4a on home (0 taps); Study group tab "রুটিন" (2 taps); empty state names the cause | B4a, WP-C |
| My attendance this month | 2 taps; wrong headline | B2 card 1 on home (0 taps), month-to-date, banded; page fixed | B2, WP-C |
| My latest result | 3 taps, dead end | B2 card 4 (0 taps), tap opens detail with raw marks and rank | B2, WP-C |
| Pay or see my fee | 2 taps; card only if due | B2 card 2 always visible with tone; fees page tinted summary with overdue month emphasised | B2, WP-C |
| Ask for leave | 2 taps, form above the list | quick action (1 tap) to `#new-leave`; leave page shows pending and rejected requests first; B1 reports status | B3, WP-C |
| Read a notice | 1 tap from home; no urgency | urgent notice appears in B1 (alert) and B4c with a rail; back via `PageHeader backHref` | B1, B4c, WP-B and WP-C |

## 4. Page-by-page changes

Common to every page (WP-C and WP-D implement): remove the page-owned `<main className="w-full max-w-3xl p-6">` and the manual `h1`; let `StudentShell` pass `contentContainer` true so the shell supplies `<main>`, `px-gutter pt-section pb-16`; start with `PageHeader` (title, crumb `student.nav.home` then group, `backHref` on detail pages, `badge` with a count or date) and `SectionTabs` for the group; cards become `Card` or `WorkflowCard`; spacing `gap-grid`/`mb-section`; every date `formatDate`/`formatTime`, every number `formatNumber`, every amount `formatMoney`; every empty state an `EmptyState` with one action (or an inline link when the empty state is a single row); controls `min-h-11` on phone; keep `pageTitle` metadata. Content width: lists use `grid gap-grid lg:grid-cols-2`; do not cap at 3xl. Because `contentContainer` is a shell-wide switch, WP-A flips it only once all pages are converted (until then pages stay self-contained). See D8 for the staging.

### 4.1 Routine
Header with print button (existing `PrintTrigger`) as `actions`. Weekly grid on desktop uses `TableFrame` with `thClass`/`tdClass`; today's column highlighted with `bg-brand-50`. Phone keeps one card per day, today first and marked with a brand "আজ" badge (existing). Empty: `EmptyState` (`student.noRoutine`, action to Home).

### 4.2 Notices and notice detail
List: one `Card` per notice with a status rail (alert for urgent, brand for unread, muted otherwise), label text kept (importance label, "নতুন"). Desktop two columns. Detail: `PageHeader` with `backHref=/student/notices`; the ask-a-question form below the body stays (action unchanged).

### 4.3 Tasks and task detail
Four piles become one list with a status rail per row: overdue alert, due within 2 days sun, later muted, done mint (labels as today). Row is a tappable `Link` `min-h-11`; the tick toggle button grows to `min-h-11 min-w-11`. Handed-in rows show the mint "জমা দেওয়া হয়েছে" label and sit in the Done pile on this page too (see D2, default yes: uses the new helper, `bucketFor` untouched). Header badge: pending count. `SectionTabs` Study group. Empty: `EmptyState` with action to Routine.

### 4.4 Results and result detail
List: `Card` rows with exam name, `formatNumber` year and subject count, total `obtained / full` as note. Detail: `PageHeader` with `backHref=/student/results` and the print action. When `scheme == null` (the #702 case): show a clear tone-sun note `student.gradeUnavailable` ("গ্রেড এখনো দেখানো যাচ্ছে না, নম্বর নিচে দেওয়া আছে"), the marks table from `student_exam_result` rows (subject, obtained / full via `formatNumber`, grade column "—"), the total, and the rank card from `student_exam_rank` (already readable) if no subject is missing. When `scheme` loads, the existing GPA/grade/pass/rank cards and grade column are shown as today. The print link is hidden while `scheme == null` because that route 404s; no change to the print route. Table uses `thClass`/`tdClass`/`trClass`.

### 4.5 Exams
Header badge: number of upcoming papers. One `Card` per exam with a rail: today alert, within 3 days sun, later muted. Papers as rows with `formatDate` and times formatted from `start_time`/`end_time` (a `formatClock('HH:MM:SS')` pure helper in `lib/student/dashboard.ts` is needed because `formatTime` takes a Date; WP-B provides it, WP-D consumes it). Seat line as today. Admit card button `min-h-11`. Empty: `EmptyState` (`student.noExams` and hint) with action to Results.

### 4.6 Attendance
`PageHeader` with the month label as badge and month navigation as `actions` using 44px chips. Four `StatCard`s (percent banded, present, absent working days, off days) replace the three plain cards; the absent-days call uses `min(monthEnd, today)` for the current month. Calendar stays a 7-column grid in a `Card`, cells `min-h-11` on phone, legend as labelled chips (text already present). When no records exist for the month: replace the cards' numbers with "—" and show the existing explanation as a `WarningBanner`-style note inside the page (use `WarningBanner` with link to Leave).

### 4.7 Leave
Order: header, then a `Card` "আমার আবেদন" list first with rail per row (pending sky, approved mint, rejected alert) and the status as text, withdraw button `min-h-11`; the request form `Card` with `id="new-leave"` below on desktop beside the list (`lg:grid-cols-3`: list `col-span-2`, form `col-span-1`), below on phone. Form fields and the server action unchanged. Dates by `formatDate`.

### 4.8 Fees
Four `StatCard`s (payable neutral, paid mint, fine sun if > 0, due alert if > 0 else mint) in `StatGrid`; month table with `thClass`/`tdClass`, due column in alert text and the row rail alert when `due_amount > 0` for a month before the current one; money via `formatMoney`. Keep the statement note and print button. Empty: `EmptyState` (`student.noFeeRecord`).

### 4.9 Questions
`PageHeader` with badge "N অপেক্ষায়". List first in two groups: waiting (rail sky, sun after 24 h, alert after 72 h by `waitingTone`), then answered (rail mint); ask form `Card` with `id="ask"` beside the list on desktop, below on phone. Existing `AskForm` unchanged. Empty: `EmptyState`.

### 4.10 Materials, Profile, Notifications
Materials: `Card` rows with file type icon, subject, `formatDate`; empty `EmptyState`. Profile: `ProfileHeader`/`ProfileSection`/`ProfileField` from `components/ui/profile.tsx` (the owner's profile blocks) replace the hand-rolled grid; correction form unchanged; roll via `formatNumber`. Notifications: wrap in `PageHeader`; unchanged inbox component.

## 5. Work packages

Disjoint file ownership. `web/lib/i18n.ts` and the shell and nav files have exactly one owner (WP-A). WP-A lands first with **all** new strings of section 7 added up front, so B, C and D never edit `i18n.ts`. If a package needs another string it asks WP-A (one-line request) rather than editing.

### WP-A: Shell, menu, shared pieces (lands first)
**Owns:** `lib/student-nav.ts` (new), `components/student-shell.tsx` (new), `app/student/layout.tsx`, `lib/school-search.ts` (only the `STUDENT_SEARCH` block), `lib/i18n.ts` (all new keys), `tests/unit/student-nav.test.ts` (new), `e2e/student/portal.spec.ts` (nav assertions only), `app/student/loading.tsx`.
**Goal:** 5-group menu, phone bottom bar, grouped desktop sidebar, avatar Profile link, group `SectionTabs` helper, all strings in place.
**Tasks, in order:**
1. Add every key from section 7 to `lib/i18n.ts` (bn and en).
2. `lib/student-nav.ts`: `STUDENT_NAV_GROUPS` (key, labelKey, shortLabelKey, icon, items with href, titleKey, icon, matchPrefixes), `studentGroupFor(pathname)` (longest prefix), `studentGroupTabs(groupKey, counts)` returning `SectionTab[]`.
3. `components/student-shell.tsx`: adapter over `AppShell` (brand, nav with `section`, `profile.href='/student/profile'`, search from `STUDENT_SEARCH`, `bell` default, `bottomNav={<StudentBottomNav/>}`), `StudentBottomNav` copied from `SchoolBottomNav`.
4. `layout.tsx`: build icons through `school-icons` `Icon` where a name exists (`dashboard`, `classes`, `exams`, `attendance`, `fees`, `notices`), `StrokeIcon` otherwise; render `StudentShell`; keep `contentContainer={false}` until WP-C and WP-D report all pages converted, then switch to `true` (single-line change, D8).
5. Update `STUDENT_SEARCH` order and add entries for the group names.
6. Update the nav checks in `e2e/student/portal.spec.ts`.
**Acceptance checks:**
- 390px, Bangla: bottom bar shows exactly 5 tabs (হোম, পড়াশোনা, পরীক্ষা, হাজিরা, ফি ও নোটিশ), each >= 44px high, active tab follows the route (e.g. `/student/leave` activates হাজিরা); hamburger drawer lists 11 grouped items; theme and language switch present in the drawer; avatar popover shows Profile and logs out.
- 1440px: sidebar shows 5 sections with the active section expanded; no horizontal scroll at either width.
- Every old URL (12 routes, plus `/student/notifications`) returns 200 for the student.
- `npm run typecheck` and `npm test` green; `STUDENT_SEARCH` entries all resolve.
**Unit tests:** `student-nav.test.ts`: every route in the old 12-item list maps to exactly one group; `studentGroupFor` longest-prefix cases (`/student/results/abc` is Exams, `/student/tasks/abc` is Study, `/student` only Home); `studentGroupTabs` badge counts omit zero; `STUDENT_SEARCH` hrefs all exist in the nav or the notifications route.
**Depends on:** none.

### WP-B: Home dashboard and pure helpers
**Owns:** `app/student/page.tsx`, `app/student/home-cards.tsx`, `app/student/day-plan.tsx`, `lib/student/dashboard.ts` (new), `tests/unit/student-dashboard.test.ts` (new), `e2e/student/home.spec.ts` (new).
**Goal:** the home of section 2.
**Needs from WP-A:** the new i18n keys; `StudentShell` in place (the home can ship against the current shell too).
**Tasks, in order:**
1. `lib/student/dashboard.ts` (pure, no I/O): `schoolDay(timestamp)`, `dashboardTaskCounts`, `buildStudentAlerts` (tone and ordering rules of 2.2 B1), `attendanceBand(percent)`, `latestResult(rows)` returning raw total and the state `ok | incomplete | none`, `buildStudentUpcoming`, `formatClock('HH:MM:SS', lang)` (consumed by WP-D too).
2. `page.tsx`: one `Promise.all` of the loaders and queries listed in 2; compose `PageHeader`, `WarningBanner`, `AlertStrip` or the all-clear `Card`, `StatGrid` with four `StatCard`s, `QuickActions`, lower-row `WorkflowCard`s.
3. `day-plan.tsx`: export `PeriodList` and `EmptyDay` for reuse inside the WorkflowCard; remove `DayPlanCard` only after nothing imports it (keep it exported if the routine page uses it; WP-C must not rely on it).
4. `home-cards.tsx`: rewrite as `NoticeRows` (rail, unread dot, urgent label); remove the fee-due card (now a stat card).
5. e2e `home.spec.ts` (read-only): home renders alert strip or all-clear, four stat cards, no console errors at both widths.
**Acceptance checks:**
- 390px: first screen (no scroll) shows the header and the first alert rows or the all-clear card; stat cards 2 x 2; nothing overflows; quick-action chips >= 44px; blocks in the order of the phone wireframe.
- 1440px: strip 3 columns, stat cards 4 in a row, lower row `2/3 + 1/3`; content spans the shell width.
- Student with no routine, exam, attendance, leave data (the seed): every block shows its designed empty state with text, no blank tile; result block shows the raw total and rank for the seeded exam, no "grade".
- Digits are Bangla in every block; money via `formatMoney`; times via `formatClock`.
- Block never calls `grading_schemes`, `grade_bands`, `exams` (grep check).
**Unit tests:** `student-dashboard.test.ts`: overdue vs due-soon boundaries (due today is due-soon, yesterday overdue, day computed in Asia/Dhaka around midnight UTC); a handed-in task is not pending; alert ordering (alert before sun before sky, then earliest date); fee rule (past-month due is alert, current-month-only is sun, zero is none); exam today alert and 1 to 3 days sun; rejected leave only within 7 days; attendance band edges 90, 75; `latestResult` incomplete and none states; `formatClock` bn and en; waiting question uses `isAnswered` and 24 h.
**Depends on:** WP-A (strings; navigation only for a final check).

### WP-C: Daily pages (tasks, routine, attendance, leave, questions, notices)
**Owns:** `app/student/tasks/**`, `app/student/routine/page.tsx`, `app/student/attendance/**`, `app/student/leave/**`, `app/student/questions/**`, `app/student/notices/**`, `tests/unit/student-daily-pages.test.ts` (new, only if a new pure helper is added; helpers go in `lib/student/dashboard.ts` owned by WP-B, so ask WP-B), `e2e/student/daily.spec.ts` (new).
Print routes (`routine/print`) untouched.
**Goal:** sections 4.1 to 4.3, 4.6, 4.7, 4.9 and the notice pages (4.2).
**Needs from WP-A:** strings and `studentGroupTabs`. **Needs from WP-B:** `dashboardTaskCounts` (tasks), `formatClock` (not used here), `attendanceBand` (attendance).
**Tasks, in order:** (1) attendance fix of the RPC range and stat cards (highest correctness value, do first); (2) tasks list with rails and 44px controls; (3) leave order and `#new-leave`; (4) questions grouping and `#ask`; (5) notices and routine; (6) page headers and `SectionTabs` everywhere; (7) e2e.
**Acceptance checks:**
- On 4 Oct the attendance page for the seed student reads a month-to-date absent count (not 31) and says the school has not taken attendance; for a month fully in the past the figure equals the old figure.
- 390px: no tap target < 44px on these pages (script measurement of `a, button` heights); month nav and task toggle pass; `SectionTabs` scrolls horizontally inside its own bar only.
- 1440px: pages use the shell gutters and two-column grids where specified; no `max-w-3xl`.
- Leave and ask forms still submit through the same actions (not exercised in the audit run; tested on Test School A only by the e2e `writes.spec.ts`, which must still pass).
- Handed-in task shows in Done on the tasks page when D2 is accepted.
**Unit tests:** tasks pile placement with the handed-in rule; leave list ordering (pending first, then newest); questions grouping and `waitingTone`; attendance range helper (`min(monthEnd, today)` for the current month, month end for past months).
**Depends on:** WP-A and WP-B (helpers).

### WP-D: Money, exams, results, profile, materials, notifications
**Owns:** `app/student/fees/page.tsx`, `app/student/exams/page.tsx`, `app/student/results/page.tsx`, `app/student/results/[examId]/page.tsx`, `app/student/materials/**`, `app/student/profile/page.tsx`, `app/student/notifications/**`, `e2e/student/money-exams.spec.ts` (new).
Print and admit-card routes (`fees/print`, `results/*/print`, `exams/*/admit-card`) untouched.
**Goal:** sections 4.4, 4.5, 4.8, 4.10.
**Needs from WP-A:** strings, `SectionTabs` helper. **Needs from WP-B:** `latestResult`, `formatClock`.
**Tasks, in order:** (1) result detail fallback (dead end, highest impact); (2) results list; (3) fees tinted summary and month table; (4) exams cards with rails; (5) profile blocks, materials, notifications; (6) e2e.
**Acceptance checks:**
- Seed student: result detail shows the XS1 Physics row `৭২ / ১০০`, total, rank `১ / ১`, the grade-unavailable note, no empty table, and no print button; no 404 reachable by a visible link.
- Fees page: due month highlighted (alert rail and text), all amounts `৳` with Bangla digits; summary cards tinted.
- 390px and 1440px: no horizontal page scroll, controls >= 44px on phone.
- Profile roll and student number display consistently with home.
**Unit tests:** `latestResult` is owned by WP-B; WP-D adds `tests/unit/student-result-fallback.test.ts` (raw total, missing subject, rank omitted when incomplete).
**Depends on:** WP-A, WP-B (helpers).

### File ownership table

| Package | Owns |
|---|---|
| WP-A | `lib/student-nav.ts`, `components/student-shell.tsx`, `app/student/layout.tsx`, `app/student/loading.tsx`, `lib/school-search.ts` (STUDENT_SEARCH only), `lib/i18n.ts`, `tests/unit/student-nav.test.ts`, `e2e/student/portal.spec.ts` |
| WP-B | `app/student/page.tsx`, `app/student/home-cards.tsx`, `app/student/day-plan.tsx`, `lib/student/dashboard.ts`, `tests/unit/student-dashboard.test.ts`, `e2e/student/home.spec.ts` |
| WP-C | `app/student/{tasks,attendance,leave,questions,notices}/**`, `app/student/routine/page.tsx`, `e2e/student/daily.spec.ts` |
| WP-D | `app/student/{fees,exams,results,materials,profile,notifications}/**` (page files only, print and admit-card routes excluded), `tests/unit/student-result-fallback.test.ts`, `e2e/student/money-exams.spec.ts` |

Order: WP-A, then WP-B and WP-D (helpers needed from WP-B before WP-D finishes: WP-B should merge `lib/student/dashboard.ts` first, within hours), then WP-C. `e2e/student/writes.spec.ts` and `school-side.spec.ts` are not owned by any package and must stay green.

Shared files nobody else may touch: `components/ui/*`, `components/app-shell.tsx`, `components/school-shell.tsx`, `lib/school-nav.ts`, `app/globals.css`, `lib/i18n.ts` (WP-A only), server-action files in `lib/student/*-source.ts`.

## 6. Risks and open decisions (default in bold so work can proceed)

| # | Decision | Default |
|---|---|---|
| D1 | Five groups and their names, Profile moved to the avatar menu | **As in section 1.** Alternative: keep Profile as a sixth sidebar item on desktop only. |
| D2 | Submitted-but-unticked homework counts as handled (dashboard and tasks page) | **Yes**, via a new helper; `bucketFor` and `splitTasks` unchanged. |
| D3 | Homework due dates inside the "আসন্ন" list reuse the `class` kind (sky rail) because `UpcomingKind` has no `task` kind | **Reuse `class`** and put "জমার তারিখ" in `detail`; adding a kind touches the owner's `lib/dashboard.ts` and `upcoming-list.tsx`. |
| D4 | Urgency thresholds: task due within 2 days is amber, exam within 3 days is amber, attendance < 75 amber and >= 90 green, fee past-month due red, question waiting > 24 h | **As stated**, constants named in `lib/student/dashboard.ts` so a school can tune in one place (same approach as `WAITING_WARN_HOURS`). |
| D5 | Exams tab lands on Results for 7 days after a publish | **No**, always land on Exams; the home result card gives the 1-tap path. |
| D6 | Tab count badges require extra queries on every page | **Home only**; tabs show no counts in this plan (counts appear in `SectionTabs` on pages that already loaded them). Revisit if students ask. |
| D7 | Extract a generic bottom tab bar from `SchoolBottomNav` | **No now**: copy in `student-shell.tsx`; refactor later with owner regression coverage. |
| D8 | Switch `contentContainer` to `true` for the student shell | **After WP-C and WP-D finish**, in one line in `layout.tsx` by WP-A; until then pages keep their own `<main>`. A page converted early would double up gutters. |
| D9 | Show a rank while grades are unreadable | **Yes**: `student_exam_rank` is readable and was already on the page; omit it when a subject mark is missing (same rule as today). |
| D10 | Do not copy the owner's ASCII count chip bug | **Format counts into the label**; fix `QuickActions.count` formatting separately in `widgets.tsx` (not in this plan). |

Risks: (1) staging of `contentContainer` can leave mixed gutters briefly (D8). (2) Rank without grade can confuse if a school hides grades on purpose; the note `student.gradeUnavailable` says grades are not shown, rank rule unchanged. (3) Dashboard query count: about 11 reads in parallel; the owner home runs about 13, acceptable; measure the home server time at the end (the owner map targets < 800 ms). (4) Seed data is thin (no routine, exams, attendance), so populated states of B2 card 1, B4a, B4b are covered by unit tests, not by browser runs; a seeded student with data is needed for final acceptance (needs the test database seeded, not a migration). (5) Existing e2e for navigation labels (`e2e/student/portal.spec.ts`) breaks until WP-A updates it.

## 7. New visible strings (all added by WP-A, for owner review)

Existing terms reused unchanged: `student.nav.home`, `student.nav.*`, `student.noTasks`, `student.noRoutine`, `student.noNotices`, `student.noResults`, `student.attNoRecords`, `student.taskOverdue`, `student.taskDueSoon`, `student.leavePending`, `student.leaveRejected`, `student.awaitingReply`, `student.newBadge`, `student.rank`, `student.marks`, `student.totalDue`, `student.readOnly`, `exams.incomplete`, `dash.urgentTitle`, `dash.viewAll`, `dash.attendanceReport`, `upcoming.none`, `upcoming.today`, `shell.bottomNav`.

| Key | bn | en |
|---|---|---|
| `student.navGroup.study` | পড়াশোনা | Study |
| `student.navGroup.exams` | পরীক্ষা ও ফলাফল | Exams & Results |
| `student.navGroup.attendance` | উপস্থিতি ও ছুটি | Attendance & Leave |
| `student.navGroup.money` | ফি ও নোটিশ | Fees & Notices |
| `student.navGroup.overview` | সংক্ষিপ্ত | Overview |
| `student.tab.study` | পড়াশোনা | Study |
| `student.tab.exams` | পরীক্ষা | Exams |
| `student.tab.attendance` | হাজিরা | Attendance |
| `student.tab.money` | ফি ও নোটিশ | Fees & Notices |
| `student.dash.needsNow` | এখনই যা করতে হবে | Needs you now |
| `student.dash.allClear` | আজ কিছু বাকি নেই | Nothing pending today |
| `student.dash.allClearHint` | বাড়ির কাজ, ফি ও নোটিশ সব ঠিক আছে। | Homework, fees and notices are all up to date. |
| `student.dash.open` | খোলো | Open |
| `student.dash.overdueTasks` | টি কাজ সময় পেরিয়ে গেছে | tasks are overdue |
| `student.dash.dueTasks` | টি কাজ ২ দিনের মধ্যে জমা দিতে হবে | tasks due within 2 days |
| `student.dash.feeDue` | বকেয়া | Fee due |
| `student.dash.examToday` | আজ পরীক্ষা | Exam today |
| `student.dash.examSoon` | শীঘ্রই পরীক্ষা | Exam coming up |
| `student.dash.urgentNotice` | জরুরি নোটিশ | Urgent notice |
| `student.dash.leaveRejected` | ছুটির আবেদন নামঞ্জুর হয়েছে | Leave request rejected |
| `student.dash.leavePending` | ছুটির আবেদন অপেক্ষমাণ | Leave request pending |
| `student.dash.questionWaiting` | প্রশ্নের উত্তর এখনো আসেনি | Question still waiting for a reply |
| `student.dash.attendanceLow` | এই মাসের উপস্থিতি কম | Attendance is low this month |
| `student.dash.newNotices` | টি নতুন নোটিশ | new notices |
| `student.dash.attendanceThisMonth` | এই মাসের উপস্থিতি | Attendance this month |
| `student.dash.daysPresent` | দিন উপস্থিত | days present |
| `student.dash.feeStatus` | ফি | Fees |
| `student.dash.monthsDue` | মাসের বকেয়া | months due |
| `student.dash.allPaid` | সব পরিশোধ | All paid |
| `student.dash.noFeeRecord` | কোনো ফি রেকর্ড নেই | No fee record |
| `student.dash.homework` | বাড়ির কাজ | Homework |
| `student.dash.overdueNote` | টি সময় পেরিয়েছে | overdue |
| `student.dash.latestResult` | সর্বশেষ ফলাফল | Latest result |
| `student.dash.totalMarks` | মোট নম্বর | Total marks |
| `student.dash.quickTitle` | আজকের দ্রুত পদক্ষেপ | Quick steps |
| `student.dash.askQuestion` | প্রশ্ন করো | Ask a question |
| `student.dash.requestLeave` | ছুটির আবেদন করো | Request leave |
| `student.dash.todayRoutine` | আজকের রুটিন | Today's routine |
| `student.dash.tomorrowLine` | আগামীকাল | Tomorrow |
| `student.dash.classesCount` | টি ক্লাস | classes |
| `student.dash.firstClass` | প্রথমটি | first |
| `student.dash.upcoming` | আসন্ন | Upcoming |
| `student.dash.latestNotices` | সর্বশেষ নোটিশ | Latest notices |
| `student.dash.viewFees` | ফি দেখুন | View fees |
| `student.readOnlyLabel` | শুধু পড়ার মোড | Read-only |
| `student.gradeUnavailable` | গ্রেড এখনো দেখানো যাচ্ছে না, নম্বর নিচে দেওয়া আছে। | Grades are not available yet; marks are shown below. |
| `student.questionsWaitingBadge` | অপেক্ষায় | waiting |
| `student.myRequests` | আমার আবেদন | My requests |

Wording notes for the owner: "হাজিরা" for the short tab (matches the SMS and staff side) versus "উপস্থিতি" (student page title); the plan uses হাজিরা on the tab and "উপস্থিতি" in headings, as the owner portal does (`nav.tabAcademics` short versus long). Number-bearing strings are composed as `{formatted number} {suffix}`; the number comes from `formatNumber`.

## 8. Needs a migration, not in this plan

1. **Issue #702**: let a student read `grading_schemes` and `grade_bands` for their own school (read-only policy or a definer view `student_grading_scheme`). Unlocks grade, GPA, pass or fail on the result page, the portal mark sheet print route, and a grade on the home result card.
2. A per-student "read" marker for teacher replies to questions (so "answered but not yet seen" can be an alert).
3. An RPC returning the home counters in one call (overdue tasks, due fee, unread notices) if the home's ~11 parallel reads measure too slow.
4. A `notices.importance` read index only if the notice query measures slow (not observed).
5. Per-payment fee receipts (needs payment history; `fee_collection_records` keeps one cumulative row per month).
