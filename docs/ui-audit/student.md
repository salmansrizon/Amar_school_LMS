# Student UI Audit

## Intended users

Students using the LMS to see daily school information, complete tasks, view academic/financial status, ask questions, and request profile corrections.

## Recommended UI model

Use a **student task portal**, not the School Owner administration groups. The sidebar can remain route-backed, but the dashboard should prioritize what the student needs today.

| Student task | Current routes | Recommended pattern | Reference direction |
| --- | --- | --- | --- |
| See today | `/student`, notifications | Today cards: next class, pending task, latest notice, fee/result alert | Adapt School Overview card hierarchy from [`overview`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-desktop.png) but simplify. |
| Check routine | `/student/routine`, `/student/routine/print` | Weekly/day routine with print as secondary action | Use touch-safe table/card switch on mobile. |
| Do tasks/materials | `/student/tasks`, `/student/tasks/[id]`, `/student/materials` | Assignments and learning materials as one learning journey | Use action/review/recovery stages from screen sequences. |
| View results/exams | `/student/results`, `/student/results/[examId]`, `/student/exams`, admit card | Results and upcoming exams in one academic-status journey | Use Academics visual language from [`exams results`](../../Design%20System/new%20ui/03-academics/exams-results-desktop.png). |
| Fees | `/student/fees`, `/student/fees/print` | Due/paid summary ? receipt/print | Use Finance cards from [`fees`](../../Design%20System/new%20ui/04-finance-communication/fees-finance-desktop.png). |
| Ask questions | `/student/questions` | Ask teacher/support and see responses | Align with Messages & Requests references. |
| Profile changes | `/student/profile` | View profile and request correction | Treat correction request as recovery/update path. |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| Student navigation has many peer items for a non-admin user. | High � navigation complexity | Dashboard should group tasks into Today, Learning, Exams/Results, Fees, Help, Profile. |
| Tasks and Materials are separate nav items but one student mental model: study work. | Medium � mental-model friction | Present as Learning; keep separate routes but cross-link heavily. |
| Exams and Results are separate but strongly related. | Medium � workflow friction | Present in one academic-status section with tabs/cards. |
| Print pages are current route destinations. | Low � clutter | Keep print links as secondary actions from routine/result/fee review screens. |
| Profile correction is likely a sensitive support flow. | High � trust/recovery | Show submitted status, expected response, and clear correction categories. |

## Recommended dashboard content

1. Next class/routine item.
2. Pending tasks with due status.
3. Latest notice.
4. Result/exam alert if available.
5. Fee due alert if available.
6. Ask question/profile correction shortcuts.

## UAT failures to fix in Student flows

See the full matrix in [`uat-failure-analysis.md`](./uat-failure-analysis.md).

| Failure | Severity | Recommended fix |
| --- | --- | --- |
| Student routine shows the empty state instead of the seeded week. | Critical - UAT blocker | Reconcile student routine data lookup with the student's current Enrollment, Class Offering, Academic Year, and Shift. |
| Student task completion toggle does not reliably survive reload. | High - persistence | Make task completion toggle idempotent, persist through the public action, revalidate after save, and assert against stored state rather than optimistic UI only. |
| Owner cannot find `Seed Student A` from school-side student list during student-login management test. | Critical - cross-role workflow | Fix the School Students List search/filter issue; this is shared with the People Record Quick View implementation. |

## Compact route inventory

| Route | Intended user | Purpose | Main actions | Recommended journey | Audit note |
| --- | --- | --- | --- | --- | --- |
| `/student` | Student | Portal home | See today's summary | See today | Make task-first. |
| `/student/routine` | Student | Routine | View class schedule | Check routine | Needs mobile-friendly routine. |
| `/student/routine/print` | Student | Printable routine | Print/export | Check routine | Secondary action. |
| `/student/notices` | Student | Notices list | Read announcements | See today / Communication | Latest notice on dashboard. |
| `/student/notices/[id]` | Student | Notice detail | Read full notice | Communication | Detail route. |
| `/student/tasks` | Student | Task list | Review assigned tasks | Do tasks/materials | Combine mentally with materials. |
| `/student/tasks/[id]` | Student | Task detail | Submit/toggle task | Do tasks/materials | Primary action route. |
| `/student/materials` | Student | Materials | Download/view resources | Do tasks/materials | Learning resources. |
| `/student/results` | Student | Result list | Select exam/result | View results/exams | Academic status. |
| `/student/results/[examId]` | Student | Result detail | Review marks | View results/exams | Review stage. |
| `/student/results/[examId]/print` | Student | Printable result | Print/export | View results/exams | Secondary action. |
| `/student/exams` | Student | Exams | View exams/admit info | View results/exams | Pair with results. |
| `/student/exams/[examId]/admit-card` | Student | Admit card | View/print card | View results/exams | Document action. |
| `/student/attendance` | Student | Attendance | Review presence/absence | See status | Include status card on home. |
| `/student/leave` | Student | Leave | Submit/review leave | Help/status | Action + status needed. |
| `/student/fees` | Student | Fees | View dues/payments | Fees | Finance status. |
| `/student/fees/print` | Student | Fee printout | Print/export | Fees | Secondary action. |
| `/student/questions` | Student | Questions | Ask/view replies | Ask questions | Support/communication. |
| `/student/profile` | Student | Profile | View/request correction | Profile changes | Trust-critical. |
| `/student/notifications` | Student | Notifications | Review all notifications | See today | Shared inbox. |
