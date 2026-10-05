# School Owner / Head Teacher workflow audit — 2026-10-03

Five agents used the app as a School Owner, Head Teacher and Class Teacher on
branch `merge/staging-sync` (`f92793a`: current staging + the owner UI
overhaul), Test School A, at localhost:3700, in Bangla, at 390×844 and
1440×900. They ran each workflow end to end, looked for bugs, inconsistencies
and UX hurdles, and proposed a better version of each workflow. No app code
was changed. No SMS was sent and nothing was paid.

Area reports (evidence, file:line causes, current and proposed flows):
[people](people.md) · [attendance](attendance.md) · [academics](academics.md) ·
[finance-admin](finance-admin.md) · [cross-cutting](cross-cutting.md)
([page matrix](cross-cutting-matrix.md)).

## Totals

| Area | Findings | Blocker | Major | Minor | Polish |
|---|---|---|---|---|---|
| People | 41 | 1 | 9 | 17 | 14 |
| Attendance & leave | 28 | 0 | 13 | 13 | 2 |
| Academics | 53 | 2 | ~20 | ~20 | ~11 |
| Finance, SMS, notices, admin | 44 | 0 | 10 | ~22 | ~12 |
| Cross-cutting (76 pages) | 19 | 0 | 8 | 7 | 4 |

## How findings were validated

- Each agent wrote a finding as one testable claim plus captured evidence
  (page text, measurement, HTTP status, console line) and ran `jev_verify` on
  it. No finding below was contradicted. Verdicts under 0.8 are marked
  "review". Findings not sent to jev are marked "unvalidated".
- The 48 blocker and major findings were then ranked with `jev_rerank` for
  release urgency (wrong person can change data, money/marks/attendance wrong,
  crash, costly SMS first; polish last). The order below is that ranking.
- This session re-checked one finding by hand: the employee search crash
  reproduces, and the same line is on `feat/owner-ui-overhaul`, so it predates
  the staging merge.
- Not established for any finding: whether it also exists on `staging` today.

## Ranked: fix before release

| Rank | Id | Problem | Where | Fix | jev |
|---|---|---|---|---|---|
| 1 | AC1 | A class teacher can publish, save, delete and close an exam of a class that is not theirs | `/school/exams/<id>` exam actions | Server-side class-ownership check in every exam action | verified 0.98 |
| 2 | AC3 | Marks entry stores "not entered" as 0; 150 silently becomes 100; no absent option | marks entry | Blank = empty, absent toggle, error above maximum | verified 0.86 |
| 3 | FI4 | Receipt says no ledger entry and zero received for a record with ৳300 received | `fees/receipt/[id]/page.tsx` L40-46 | Fix the ledger lookup | review 0.65 |
| 4 | FI7 | Editing a partial fee record shows fee 0 / total 0 / due 0; list says due ৳200 | fee edit form; fee amount not stored | Store the fee amount on the record | unvalidated |
| 5 | FI1 | Overpayment accepted silently (৳900 on a ৳500 fee) | `fee-form.tsx` | Block or confirm when received > total | verified 1.0 |
| 6 | AC4 | Students with no marks show as failed (0/200, F); promotion defaults them to repeat | result book | "Incomplete" state, excluded from pass/fail | verified 0.97 |
| 7 | FI3 | SMS "send now" has no confirmation and no total cost | `sms/compose-form.tsx` L358 | Confirm sheet: recipients × parts = credits, balance | review 0.76 |
| 8 | FI11 | `saveFeeRecord` checks school membership only, not the fees permission | fees server action | Add the permission check | unvalidated (code reading, not exercised) |
| 9 | AC2 | Exam publish/unpublish on one click, even with 12 of 14 students unmarked | exam page banner | Confirm with counts; readiness checklist | verified 1.0 |
| 10 | AT2 | Attendance book counts unmarked past days as absent, even before the student existed | `attendance/book/page.tsx` `registerDayStatus` | Skip dates before enrolment | verified 0.98 |
| 11 | PE1 | Employee search crashes the page for any query | `employees/page.tsx:145` | `String(e.unique_id ?? '')` | verified; reproduced by hand |
| 12 | AT3 | Approved leave not shown on the mark page or book; present/absent can be saved on a leave day | mark page, book | Leave badge and leave symbol | verified 0.93 |
| 13 | AT4 | Dashboard "3.5% present today" divides by all 287 students | `app/school/page.tsx` L140 | Count only classes where attendance was taken | verified 0.99 |
| 14 | FI2 | "Unpaid list" links drop the month (July: 10 unpaid → current month: 0) | `fees/page.tsx` L346, L366 | Pass month and year | verified 0.99 |
| 15 | PE5 | Archiving an employee leaves their staff login active | employee archive | Warn and offer "revoke login" | verified |
| 16 | AC6 | A grading scheme with no grade bands can be attached to an exam | grading schemes | Require at least one band | review 0.51 |
| 17 | PE9 | Staff with no permissions still see totals and 343 pending approvals on the dashboard | `/school` | Hide stat tiles without permission | verified |
| 18 | AT8 | No off-day warning when marking; unsaved attendance lost on navigation | mark page | Off-day warning, unsaved-changes prompt | verified 0.97 / 0.98 |
| 19 | AC7 | Merit position ties at 1 for totals 170 and 133 | result book | Total marks as tiebreaker | verified 0.99 |
| 20 | PE3 | Guardian mobile "abc123" accepted (used for SMS) | admission and profile edit | Validate `^01[3-9]\d{8}$` | verified |
| 21 | AT10 | Class teacher's "pending leave: 1" vs 0 rows in their list | `mark/page.tsx` L81, L86 | Scope counts to their classes | verified 0.99 |
| 22 | AC5 | Exam progress inflated (26/28 when 8 entered) | `/school/exams` | Count only real marks | verified 0.99 |
| 23 | AT7 | Leave approve/reject: one click, no undo, no reason | student leave page | Undo toast, reason sheet | verified 0.99 |
| 24 | AC10 | No save feedback in exam setup; unsaved marks dropped on subject switch | exam setup, marks entry | Toasts, unsaved-changes prompt | verified 0.98 |
| 25 | FI12 | Dashboard 287 students vs students page 282 | `/school` vs `/school/students` | One shared count | unvalidated |
| 26 | AT1 | A class teacher with the attendance permission can manage machines, Grace Time, Office Hour, employee calendar and leave | `/school/attendance/*` | Product decision — see below | verified 1.0 |
| 27 | PE2 | Duplicate roll shows raw Postgres text | admission | Catch 23505, Bangla message | verified |
| 28 | FI8 | Director capital: balance ৳13,95,000 vs invested ৳81,000 vs ledger ৳86,301 | director capital | Show opening balance, reconcile | verified 0.95 |
| 29 | AT5 | Weekly off-day: calendar "holiday", table "absent", list "not arrived 0%" | employee calendar, table, list | One holiday-aware status | verified 0.86 |
| 30 | AC9 | Exam routine accepts overlapping exams; raw English error | exam routine | Overlap check, Bangla message | verified 0.99 |

Ranks 31–48 (notices edit/unpublish, wrong exam status chip, delete → 404,
money/date formats, incomplete-profiles link, split leave filters, phone
attendance speed, long-name overflow, unlabeled inputs, subscription page,
modal accessibility, skip link, contrast, glossary, tap targets, page titles)
are in the area reports.

## Root causes shared by several findings

| Root cause | Findings it explains | One fix |
|---|---|---|
| Empty marks stored and counted as 0 | AC3, AC4, AC5, AC7 | Nullable marks + "incomplete" state |
| "Absent" computed for days with no record | AT2, AT5, People #8 (employee absent before joining) | One status function that knows enrolment/joining date, holidays and leave |
| Counts computed differently per page | AT4, FI12, AT10, PE7 | One shared source per number |
| No server-side role/ownership check beyond the screen permission | AC1, FI11, AT1 | Check ownership/permission inside server actions |
| One-click irreversible actions | AC2, FI3, AT7, FI1 | One confirm pattern with the numbers that matter |
| No shared formatters | money (৳500 vs ৳৫০০), 8 date formats, Latin digits in Bangla | `formatTaka`, `formatDate`, `numberFmt(lang)` everywhere |
| No save feedback | AC10, People (edit, transfer, archive), notices | Toast after every save |
| Raw errors and missing validation | PE2, PE3, PE4, AC9 | Shared validators + Bangla messages |

## Best version — workflow scores (1–5)

Scores are the auditing agents' own judgement, not measurements. Columns:
effort / Bangla clarity / error-proofing / feedback / phone fit / consistency.

| Workflow | Current | Proposed | Core change |
|---|---|---|---|
| Exam end to end | 2/2/1/1/2/2 | 4/5/4/4/4/4 | Six-step flow (info, subjects, routine, marks, results, publish), one "next step" button, gated publish |
| Take attendance on phone | 2/3/2/4/2/3 | 5/5/4/5/5/4 | Auto-select the teacher's class, apply on pick, compact header |
| Owner morning check | 2/2/3/3/2/1 | 5/4/4/4/4/4 | Dashboard numbers from the same source as the pages they link to |
| Fee collection and receipt | 2/3/2/2/3/2 | 4/5/5/5/4/5 | Overpayment guard, stored fee amount, redirect to receipt with toast |
| SMS Center | 4/3/1/3/3/2 | 4/5/5/4/4/4 | Confirm sheet with cost and balance |
| Leave request/approve | 3/3/1/3/3/2 | 4/4/4/5/4/4 | Undo on approve, reason on reject, one filter bar |
| Subscription | 1/1/2/1/–/– | 4/4/4/4/4/4 | Add `/school/subscription`, link the dashboard card |
| Admit a student | 3/4/1/2/3/3 | 5/4/4/4/4/4 | Validate mobile and roll, success card with next actions |
| Employee add/find | 2/3/1/2/3/2 | — | Fix search crash, validation, shift field, revoke-login prompt |

Full current and proposed step lists are in the area reports.

## Decisions needed from the owner of the product

1. **AT1** — should a class teacher with the `attendance` permission manage
   machines, Grace Time and Office Hour? Staging moved Office Hour under that
   permission on purpose (ADR 0029), so this is the model working as built.
2. **FI9** — is a subscription page in scope for this release?
3. **FI5** — should notices be editable after publishing?

## Not covered

Other roles (super admin, student, guardian); real SMS sending and credit
purchase; fee-structure creation, vouchers, bank and assets tabs; combined
exams, seat plans, running a promotion; grades with real grade bands; Standing
Grace Rule creation; machine enrollment writes; print layouts on paper; a full
English pass; production-build load times (all timings are from the dev
server, which was unstable for part of the run).

## Test data left in Test School A

The app has no delete for these; remove them in the database.

- Class "UXA-Att 1790996221552" with 12 "UXA-Att …" students, their Oct 3
  attendance records, and subjects "UXA-Acad Math 10030858" and
  "UXA-Acad Eng 10030858".
- Student leaves: Rahim Oct 6–8 (pending), Karim Oct 29–Nov 2 (approved),
  Fatema Oct 4 (rejected), Sadia Oct 1–3 (approved).
- Employee leave for **"Staging Teacher Two"**, Oct 4–5, approved — this is an
  existing staging employee, not test data.
- Behaviour entry "UXA-Acad behaviour test 10030858" on "UXA-Att Rahim Uddin".
- Archived students S9269, S9270, S9283–S9288 ("UXA-People …"); three student
  logins (S9283, S9285, S9287); one behaviour note on S9283.
- Archived employee `d422add5-7059-48b4-8734-c1eaf88edd5b` and its **still
  active** staff login "UXA-People Emp Test"
  (`adba13dd-be9e-4f5e-924f-23005e308449`, no screen access).
- Fee record `2c0841f9-d8ff-4695-aa7a-22ff1b298c40` (৳500, October 2026, two
  ledger entries) for "UXA-People 20261003C Roll1".
