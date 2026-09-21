# School Owner and Staff UI Audit

## Intended users

- School Owner: full school administration, subscription/SMS purchase, staff permission control.
- Staff User: grant-gated access to selected school modules.
- Class Teacher: reaches teaching work through `My Classes` and assigned task flows.

## Recommended UI model

Use the `Design System/new ui/` School Owner journey model as the target presentation and apply the shared [`Design grid system`](./design-grid-system.md). Keep existing hrefs and permission checks; group navigation visually.

| Recommended group | Current route families | Recommended entry/action/review model | Reference images |
| --- | --- | --- | --- |
| Overview | `/school`, `/school/activity`, `/school/approvals`, `/school/profile` | Dashboard orients with urgent actions; approvals become the decision inbox; profile is account context. | [`dashboard desktop`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-desktop.png), [`dashboard mobile`](../../Design%20System/new%20ui/01-overview/school-owner-dashboard-mobile.png), [`overview flowboard`](../../Design%20System/new%20ui/06-detailed-flowboards/overview-flowboard-desktop.png) |
| People | students, employees, staff-adjacent records | Directory ? add/admit ? review record ? archive/recover/no-results. | [`student directory`](../../Design%20System/new%20ui/02-people/student-directory-desktop.png), [`admission`](../../Design%20System/new%20ui/02-people/student-admission-desktop.png), [`employees`](../../Design%20System/new%20ui/02-people/employees-directory-desktop.png), [`people sequence`](../../Design%20System/new%20ui/07-screen-sequences/people-01-entry-desktop.png) |
| Academics | classes, attendance, exams, my-classes | Find class/year/shift ? act on routine/attendance/exam setup ? review book/results/printables ? recover from no students/no offering. | [`classes`](../../Design%20System/new%20ui/03-academics/classes-curriculum-desktop.png), [`attendance`](../../Design%20System/new%20ui/03-academics/attendance-desktop.png), [`exams`](../../Design%20System/new%20ui/03-academics/exams-results-desktop.png), [`academics flowboard`](../../Design%20System/new%20ui/06-detailed-flowboards/academics-flowboard-desktop.png) |
| Finance & Communication | fees, sms, notices, questions/corrections/feedback | Collect/settle money and send/publicize messages without mixing their data models. | [`fees`](../../Design%20System/new%20ui/04-finance-communication/fees-finance-desktop.png), [`sms`](../../Design%20System/new%20ui/04-finance-communication/sms-center-desktop.png), [`notices`](../../Design%20System/new%20ui/04-finance-communication/notices-desktop.png), [`messages`](../../Design%20System/new%20ui/04-finance-communication/messages-requests-desktop.png) |
| Administration | institute, staff, templates, venues, logistics | Configure institution ? staff grants ? review saved access/setup ? recover from unsaved/owner-only states. | [`institution settings`](../../Design%20System/new%20ui/05-administration/institution-settings-desktop.png), [`staff permissions`](../../Design%20System/new%20ui/05-administration/staff-permissions-desktop.png), [`administration flowboard`](../../Design%20System/new%20ui/06-detailed-flowboards/administration-flowboard-desktop.png) |

## Key current UI findings

| Finding | Severity | Recommended improvement |
| --- | --- | --- |
| School routes are numerous and several important workflows are split across sibling screens. | High � navigation complexity | Use the five journey groups above in sidebar/drawer presentation; leaf links keep current hrefs/grants. |
| Many pages rely on local tab strips plus global sidebar; this can make users choose between module navigation and workflow navigation. | High � workflow friction | Each group should have a visible journey header: current step, primary action, secondary tabs. |
| School Owner reference already defines desktop/mobile visual direction. | Medium � design consistency | Treat `Design System/new ui/` as the canonical image reference for hierarchy, spacing, grouped sidebar, and recovery states. |
| Staff permissions are route/screen based, but navigation simplification must not imply new roles/templates. | Critical � authorization risk | Hide unavailable items; never show disabled unauthorized screens as if requestable. |
| Attendance, exams, fees, and student admission are high-risk data workflows. | Critical � operational risk | Use explicit review screens/receipts/books after action, with undo/recovery paths when safe. |
| Print routes are functional destinations but should not dominate normal navigation. | Medium � clutter | Keep print actions inside review screens, not as first-class sidebar items. |
| Feedback, questions, corrections and notices overlap conceptually as communication. | High � mental-model confusion | Present as a Communication/Requests group while preserving separate route families. |
| Archive and recovery screens exist for students/classes/employees. | Medium � discoverability | Surface archived/recoverable records from directories as secondary actions, not separate mental destinations. |

## Recommended screen pattern

Every major School journey should show:

1. **Context bar**: active school, selected shift/year if relevant, permission/subscription state.
2. **Journey title**: group + task, e.g. `People / Student Admission`.
3. **Primary action**: one prominent button/form step.
4. **Secondary actions**: text-labeled, lower emphasis.
5. **Record table/card list**: consistent filters, no-results state, and responsive card alternative.
6. **Recovery state**: cause-specific and actionable.

## Record Quick View decision for People

Use [`Record Quick View`](./record-quick-view.md) first for People records, following [`design-grid-system.md`](./design-grid-system.md):

- Student List row/card click opens a Student Profile drawer.
- Employee List row/card click opens an Employee Profile drawer.
- On mobile, the drawer becomes a full-screen sheet.
- The drawer starts in profile/read mode.
- A permitted School Owner or Staff User sees an edit icon.
- Clicking the edit icon switches to full edit mode inside the drawer.
- Save/cancel returns to profile mode and refreshes the originating list row.
- Keep `/school/students/[id]` and `/school/employees/[id]`, but redesign them to render the same Profile/Edit UI model for direct links, search, refresh, print entry, transfer/archive/login actions, and tests.

This pattern intentionally does **not** make every high-risk workflow inline. Fees, exams, SMS, settlements, and permissions should use summary drawers plus explicit review/confirm flows.

## UAT failures to fix in School flows

See the full matrix in [`uat-failure-analysis.md`](./uat-failure-analysis.md).

| Failure | Severity | Recommended fix |
| --- | --- | --- |
| Student creation/findability and seeded student lookup fail. | Critical - UAT blocker | Fix Students List search/filter/readback while implementing Student Record Quick View. Verify Global Academic Year and Shift selection do not hide expected current students unexpectedly. |
| Class/section dropdown filtering fails across Students List, Mark Attendance, Attendance Book, and Student Log. | Critical - UAT blocker | Standardize one Class Offering picker contract for browse/manage screens, including Academic Year and Shift behavior. |
| Attendance Student Log print entry does not reach the expected printable state. | High - print workflow | Fix individual log data resolution and Today/custom filters before asserting the print button. |
| Classes CRUD fails. | High - setup workflow | Recheck Class Offering identity: name, section, academic year, shift, group department, archive/delete rules. |
| Fees payment verify/edit fails. | Critical - money workflow | Preserve the Fee Collection Record rule: one cumulative Student/month record. Fix save -> receipt -> edit round trip. |
| SMS buy/send/log/debit flows fail. | High - communication/money workflow | Verify credit balance source, segment debit calculation, send logs, and insufficient-credit recovery state. |
| Owner notifications mark/read fails. | High - communication workflow | Fix read-state persistence and owner notification seed/readback. |

## Compact route inventory

| Route family | Intended user | Purpose | Main actions | Recommended group | Audit note |
| --- | --- | --- | --- | --- | --- |
| `/school` | Owner/Staff | Dashboard | KPIs, quick actions, recent activity | Overview | Keep as orienting page. |
| `/school/activity` | Owner/Staff | Activity log | Review events | Overview | Secondary drill-down. |
| `/school/approvals` | Owner | Approval inbox | Accept/reject pending changes | Overview | Make decision-inbox pattern explicit. |
| `/school/profile` | Owner/Staff | Account profile | View role/school info | Overview | Account context, not core module. |
| `/school/students` | Owner/Staff with grant | Student directory | Search/filter/open student | People | Primary entry for student records. |
| `/school/students/new` | Owner/Staff with grant | Admission | Create student/admission draft | People | High-priority action flow. |
| `/school/students/[id]` | Owner/Staff with grant | Student record | Review/edit/print/transfer | People | Review/outcome page. |
| `/school/students/archive` | Owner/Staff with grant | Archived students | Restore/review archive | People | Recovery/secondary action. |
| `/school/students/logins` | Owner/Staff with grant | Student login management | Issue/manage logins | People | Should be reachable from student records and directory. |
| `/school/students/subject-assignment` | Owner/Staff with grant | Subject assignment | Assign subjects | Academics/People | Cross-link from class/student context. |
| `/school/employees` | Owner/Staff with grant | Employee directory | Search/filter/open employee | People | Use same directory pattern as students. |
| `/school/employees/new` | Owner/Staff with grant | Employee creation | Add employee | People | Should match admission hierarchy. |
| `/school/employees/[id]` | Owner/Staff with grant | Employee record | Review/edit/archive | People | Review/outcome page. |
| `/school/employees/archive` | Owner/Staff with grant | Archived employees | Restore/review | People | Recovery/secondary action. |
| `/school/staff` | Owner only | Staff permissions directory | Choose staff user | Administration | Owner-only setup. |
| `/school/staff/[id]` | Owner only | Individual grants | Toggle permissions | Administration | Must preserve screen-level grants. |
| `/school/classes` | Owner/Staff with grant | Classes/curriculum | Manage offerings/subjects | Academics | Academic setup entry. |
| `/school/classes/archive` | Owner/Staff with grant | Archived class offerings | Restore offerings | Academics | Recovery state. |
| `/school/classes/routine` | Owner/Staff with grant | Class routine | Build timetable | Academics | Part of class journey. |
| `/school/classes/routine/print` | Owner/Staff with grant | Print class routine | Print/export | Academics | Keep as print action. |
| `/school/classes/syllabus` | Owner/Staff with grant | Syllabus/material setup | Manage syllabus | Academics | Consider clearer relation to materials. |
| `/school/attendance` | Owner/Staff with grant | Attendance overview | Choose mark/book/log flows | Academics | Can become landing/orient stage. |
| `/school/attendance/mark` | Owner/Staff with grant | Mark student attendance | Mark register | Academics | Primary action. |
| `/school/attendance/book` | Owner/Staff with grant | Attendance book | Review attendance | Academics | Review stage. |
| `/school/attendance/student-log` | Owner/Staff with grant | Student attendance lookup | Search student logs | Academics | Review/drill-down. |
| `/school/attendance/student-log/[studentId]` | Owner/Staff with grant | Individual log | Review one student | Academics | Detail route. |
| `/school/attendance/employee` | Owner/Staff with grant | Employee attendance | Mark/review employee attendance | Academics/People | Consider placement under People or Attendance. |
| `/school/attendance/leave` | Owner/Staff with grant | Leave requests | Review/manage leave | Academics/People | Clarify user mental model. |
| `/school/attendance/off-days` | Owner/Staff with grant | Off-days | Configure off-days | Administration/Academics | Setup screen. |
| `/school/exams` | Owner/Staff with grant | Exam list/setup | Create/manage exams | Academics | Exam module entry. |
| `/school/exams/[id]` | Owner/Staff with grant | Exam dashboard | Setup/review exam | Academics | Journey hub. |
| `/school/exams/[id]/marks-entry` | Owner/Staff with grant | Marks entry | Enter marks | Academics | Primary action. |
| `/school/exams/[id]/routine` | Owner/Staff with grant | Exam routine | Build routine | Academics | Setup/action. |
| `/school/exams/[id]/seat-plan` | Owner/Staff with grant | Seat plan | Build plan | Academics | Setup/action. |
| `/school/exams/[id]/result-book` | Owner/Staff with grant | Results review | Review result book | Academics | Review stage. |
| `/school/exams/[id]/promotion` | Owner/Staff with grant | Promotion | Promote students | Academics | Critical bulk action; needs confirmation/recovery. |
| `/school/exams/[id]/*print*`, admit cards, mark/progress sheets | Owner/Staff with grant | Exam documents | Print/export | Academics | Keep behind document modal/review pages. |
| `/school/exams/grading-schemes`, `/combinations`, `/cocurricular-items`, `/result-inquiry` | Owner/Staff with grant | Exam configuration/inquiry | Configure/review | Academics | Use subnav but keep hierarchy clear. |
| `/school/fees` | Owner/Staff with grant | Fee collection | Select student/collect | Finance & Communication | Primary finance action. |
| `/school/fees/structures` | Owner/Staff with grant | Fee structures | Configure fees | Finance & Communication | Setup stage. |
| `/school/fees/vouchers`, `/vouchers/[id]` | Owner/Staff with grant | Vouchers | Create/review voucher | Finance & Communication | Secondary finance flow. |
| `/school/fees/receipt/[id]` | Owner/Staff with grant | Receipt | Print/review receipt | Finance & Communication | Review/outcome. |
| `/school/fees/assets`, `/bank`, `/director-capital`, `/ledger` | Owner/Staff with grant | Accounting | Manage assets/accounts/ledger | Finance & Communication | Needs finance sub-grouping. |
| `/school/sms`, `/sms/buy`, `/sms/log`, `/sms/rules` | Owner/Staff/Owner for buy | SMS center | Send/buy/review/rules | Finance & Communication | Must show credit/recovery states. |
| `/school/notices`, `/notices/new`, `/notices/[id]`, `/gallery/*` | Owner/Staff with grant | Notices/gallery | Publish/review media | Finance & Communication | Communication sub-journey. |
| `/school/questions`, `/questions/response`, `/corrections`, `/feedback`, `/feedback/ratings` | Owner/Staff | Requests/feedback | Reply/review/correct | Finance & Communication | Unify under Messages & Requests. |
| `/school/institute` and child setup routes | Owner/Staff with grant | Institution setup | Configure profile, hours, venues, templates | Administration | Settings group. |
| `/school/my-classes`, `/my-classes/tasks/[id]` | Class teacher | Assigned class work | View/review class tasks | Academics | Teacher-specific shortcut, not grant-gated sidebar. |
| `/school/permission-denied` | Owner/Staff | Access failure | Explain denied access | Shared recovery | Needs helpful route back. |
