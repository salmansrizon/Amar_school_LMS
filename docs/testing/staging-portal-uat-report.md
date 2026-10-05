# Staging Portal UAT Report

## Scope

Environment: `https://staging.edumebd.com`

Test date: 2026-08-28

Personas tested:

- Student: `s9001@test-a.students.invalid`
- School Owner: `demo.owner@amarschool.test`

The supplied throwaway staging credentials were used. Testing covered the visible UI, navigation, seeded data, empty states, form affordances, language controls, logout/login, and a 390x844 mobile viewport. No financial purchase, SMS send, or destructive record deletion was submitted.

## Executive Verdict

Authentication and role routing work. Both portals render a consistent shell, expose their main navigation, and protect role boundaries at the login layer.

Release is **not ready for sign-off**. The student exam schedule contains repeated copies of the same exam, the question subject selector contains repeated options, and several student journeys cannot deliver their intended outcome because staging has no usable notices, routine, materials, results, or fee records. English switching also requires investigation because the tested mobile owner page remained Bangla after selecting `EN`.

## Feature Results

### Student portal

| Area | Result | Evidence / interpretation |
|---|---|---|
| Login and session | Pass | Student reached `/student` and saw own name, student number, class, and roll. |
| Home dashboard | Pass with data concern | Upcoming exam appears; today/tomorrow show weekly holiday. |
| Routine | Pass, empty state | Clear message says routine is not published. |
| Notices | Pass, empty state | Clear no-notices message. |
| Homework/tasks | Pass | Existing homework appears with completion state and detail link. |
| Study materials | Pass, empty state | Clear no-materials message. |
| Results | Pass, empty state | Clear no-results message. |
| Exams | Fail | Same `XS1 Finals 2026` / `XS1 Physics` entry is repeated many times. Student cannot trust schedule count. |
| Attendance | Pass | Monthly calendar, percentage, counts, month navigation, and explanatory legend render. |
| Leave request | Partial | Start, end, reason fields and submit action exist. Empty submission focused a field but no visible explanatory validation message was observed. |
| Questions | Partial / Fail | Question form and answered questions render, but subject selector repeats `XS1 Physics` many times. |
| Profile and correction request | Pass with workflow gap | Read-only profile and correction-request form render. Existing request history is visible. |

### School Owner portal

| Area | Result | Evidence / interpretation |
|---|---|---|
| Login and dashboard | Pass | Dashboard shows school identity, 27 students, 6 employees, attendance KPI, subscription state, checklist, activity, and quick actions. |
| Students | Pass, needs workflow testing | Search, class filter, student list, detail links, archive, student-login area, and new-admission entry points render. |
| Employees | Pass, needs workflow testing | Employee list, grace configuration, filters, archive, and create entry point render. |
| Classes/curriculum | Partial | Classes and curriculum controls render. Multiple classes show no class teacher assigned despite the product rule that every class should have one. |
| Attendance | Pass, needs save verification | Class/date filters, 27-student roster, per-student radios, bulk actions, and reason fields render. |
| Exams/results | Pass, needs end-to-end verification | Exam creation, search/filter, details, marks entry, co-curricular, seat plan, routine, and documents entry points render. |
| Fees | Partial | Fee navigation and records render; initial state requires class selection before showing students. Payment/reflection workflow not submitted. |
| SMS | Pass, needs guarded transaction test | Compose, recipient group, send/draft actions, balance, package purchase entry point, logs, and absence rules render. No send or purchase submitted. |
| Notices/publication | Pass, needs publish verification | List, create, gallery, and view entry points render. |
| Questions/requests | Pass, needs approval verification | Student questions, correction requests, and response status entry points render. |
| Institute setup | Pass, needs save verification | Profile, print header, address, roll numbering, education levels, logo, and save controls render. |
| Staff permissions | Pass, needs authorization verification | Staff creation and per-staff permissions entry points render. |
| Approvals | Pass, needs seeded request | Approval page renders but no approval transition was completed. |
| Profile/logout | Pass | Profile page and logout action work. |

## Findings

### P1: Student exam schedule duplicates one exam repeatedly

Route: `/student/exams`

Observed: `XS1 Finals 2026` with `XS1 Physics` appeared repeatedly instead of once.

Impact: Students may think they have many separate exams, miss the canonical entry, or lose confidence in dates and seat information.

Fix recommendation: deduplicate at the query boundary using the exam identity, verify joins cannot multiply rows, and add a UI regression assertion that one exam renders once per student.

### P1: Student subject selector repeats identical subjects

Route: `/student/questions`

Observed: the subject selector contained many identical `XS1 Physics` options.

Impact: Students cannot reliably select context for a question; repeated options suggest duplicated class-subject data or an unscoped join.

Fix recommendation: return one option per subject identity for the student's class and add a uniqueness assertion in the form test.

### P1: Student core learning journeys are not demonstrable on staging

Routes: `/student/routine`, `/student/notices`, `/student/materials`, `/student/results`, `/student/fees`

Observed: routine, notices, materials, results, and fee pages had no usable records.

Impact: A real student cannot complete the core loop of finding today's learning plan, reading school communication, opening material, checking a result, or understanding fee status.

Fix recommendation: seed a complete student scenario linked to the logged-in student's class, including one published routine, notice, material, result, and fee statement. Keep empty-state tests as a separate scenario.

### P2: English switch may not change the active page language

Route: owner attendance page at 390x844

Observed: after selecting `EN`, the visible page remained Bangla. The mobile menu also changed from `Open menu` to `Close menu` during the interaction, so this needs a focused reproduction rather than immediate classification as a confirmed defect.

Fix recommendation: test language switching on desktop and mobile with a visible selected-state assertion and verify persisted locale after navigation and reload.

### P2: Leave-request validation is not user-readable

Route: `/student/leave`

Observed: submitting the empty form focused a field, but no visible inline error or summary was observed.

Impact: A student may not know which values are required or why the request was not sent.

Fix recommendation: add visible required labels/errors for start date, end date, and reason; validate end date is not before start date; preserve entered values after an error.

### P2: Class setup contains classes without assigned teachers

Route: `/school/classes`

Observed: seeded classes displayed `শিক্ষক নির্ধারিত নয়` / no teacher assigned.

Impact: Students may have no clear recipient for questions and the owner cannot complete the intended class setup state.

Fix recommendation: either enforce teacher assignment before activation or show an explicit setup blocker and dashboard task with a direct fix action.

## Ideal Workflows Missing

### Student

1. First-login orientation: explain profile, class, upcoming exam, and where to ask for help.
2. Daily learning loop: open routine, open today's material, mark homework complete, and see progress.
3. Communication loop: receive notice, open detail, acknowledge or save it, and find it later.
4. Exam loop: view one canonical schedule, print/download admit card, see seat plan when published, then view result.
5. Attendance loop: understand monthly percentage, inspect a date, and request correction when attendance is wrong.
6. Fee loop: see month-by-month statement, adjustment, due amount, payment status, and who to contact. Student should not pay if that is intentionally owner-only, but the next action must be clear.
7. Request loop: submit leave or profile correction, see validation, status, reviewer, decision, and next step.
8. Help loop: choose one subject, ask a question, see pending state, then receive a clearly attributed answer.

### School Owner

1. First setup: complete school profile, classes, teachers, subjects, student roster, login provisioning, and print branding from one checklist.
2. Daily operations: dashboard to attendance, late corrections, notices, questions, and approvals without searching across unrelated modules.
3. Academic loop: configure class/subject, create exam, add schedule, enter marks, review, publish, and verify student visibility.
4. Student lifecycle: admit, assign class/section/roll, provision login, reset password, archive/transfer, and audit each step.
5. Finance loop: configure fee structure, issue or collect, record payment, produce receipt/statement, and reconcile the ledger.
6. Communication loop: check balance, compose targeted message, preview recipient count/cost, send, inspect delivery log, and handle low balance without accidental purchase.
7. Staff governance: create staff, assign class/subject reach, verify blocked screens as that staff user, and revoke access.
8. Request resolution: see pending request context, approve/reject with reason, and verify student-visible status.

## Recommended Next Report Cycle

Run a second staging pass after the P1 fixes and complete these gates:

- Seed one coherent student journey with populated routine, notice, material, result, attendance, fee, exam, leave, question, and profile-correction records.
- Execute one complete owner-created-to-student-visible exam and notice workflow.
- Execute one owner approval of a student leave or correction request.
- Verify student login provisioning and password reset from the owner portal.
- Test English and Bangla on desktop and 390x844 mobile, including reload persistence.
- Test staff permissions with a real staff login, especially SMS purchase and ungranted screens.
- Test at least one non-destructive fee record and receipt flow; keep real SMS sending and financial purchase behind explicit test controls.
- Capture screenshots and exact repro steps for every Fail or Confusing result.

## Release Recommendation

Hold staging sign-off until the two duplication defects are fixed and the populated student scenario proves the end-to-end learning loop. Owner navigation is broad and usable, but owner workflows remain mostly entry-point verified rather than outcome verified. Student portal is visually navigable and access-controlled, not yet acceptance-ready as a complete daily product.
