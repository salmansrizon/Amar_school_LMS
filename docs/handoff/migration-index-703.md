One list of every database change recommended during the owner UI overhaul, the owner workflow audit and the student portal plan. None of these was made on `merge/staging-sync`: that branch changes no schema, policy or function. Each row links to the issue that explains the problem; this issue is the index and the suggested order.

"Migration" here means a new migration file: a column, constraint, view, policy, trigger or database function. Two rows are database work that is not a new migration (marked **ops**).

## 0. Do first

| # | Change | Why | Detail |
|---|---|---|---|
| 0.1 | **ops** — apply `0217_student_attendance_summary.sql` to the staging database | It is the only migration file on `merge/staging-sync` that `staging` does not have. It is still a draft. Until it is applied, `lib/school/attendance-rate-source.ts` returns null and pages hide the attendance-rate column | #684 |
| 0.2 | **ops** — remove audit test data from Test School A | Test rows from the audit and fix runs (students, leaves, exams, one fee record, one active staff login) | #686 |

## 1. Access and security

| # | Change | Why | Detail |
|---|---|---|---|
| 1.1 | `exams` write policy: School Owner, office staff, or a teacher attached to the exam's class. Same for the child tables (routine, seat plan, marks, co-curricular marks, combination members) | The app's server actions now refuse a teacher acting on another class's exam, but a direct API write with the teacher's own token still passes the policy | #676 |
| 1.2 | **APPLIED 2026-10-08: `0221_student_reads_grading_scheme.sql`.** Read policy (or a definer view) so a student can read `grading_schemes` and `grade_bands` for exams published to their class | The student portal cannot grade any result: it shows "no results published yet" and the portal mark sheet returns 404 | #702 |
| 1.3 | A function to disable a staff login (remove `staff_permissions`, block the auth user), callable by the School Owner | Archiving an employee leaves their login active; no revoke action exists | #688 |
| 1.4 | Scope `workflow_instances` reads (or add an RPC) to the viewer's own approver stages | Any member sees the whole school's approvals queue and count | #689 — needs a product decision first |
| 1.5 | **APPLIED 2026-10-08: `0220_employee_attendance_start.sql`** (function `employee_attendance_starts()`, gated by the attendance grant; the app falls back to the old read until it exists). Expose an attendance start date (joining date) through `employee_card` or a small view readable with the attendance permission | Non-owner roles probably cannot read `employees.joining_date`, so "no absence before joining" may not apply for them | #693 — confirm in a browser first |
| 1.6 | If option B of #677 is chosen: a separate permission for machines, Grace Time and Office Hour | A class teacher with the attendance permission can manage employee attendance settings | #677 — needs a product decision first |

## 2. Fees and finance

| # | Change | Why | Detail |
|---|---|---|---|
| 2.1 | **APPLIED 2026-10-08: `0230_fee_collection_fee_amount.sql`** (nullable, no backfill — see `docs/handoff/migrations-fees-rollout.md`). `fee_collection_records.fee_amount` (billed fee), backfilled from pay + due − fine + adjustment | The edit form derives the fee; once due is 0 an exact payment and an overpayment look the same, and the receipt has no fee line | #678 |
| 2.2 | **APPLIED 2026-10-08: `0231_fee_record_void.sql`** (also replaces the one-per-month unique constraint with a partial unique index). Void / reversal for fee records: `void_at`, `void_reason`, and an offsetting ledger entry | A wrong fee record cannot be undone in the app | #683 |
| 2.3 | Advance-payment credit carried to the next fee record, if "carry forward" is chosen | Overpayment is now acknowledged but stays on that month | #695 — needs a product decision first; depends on 2.1 |
| 2.4 | **APPLIED 2026-10-08: `0232_director_capital_guard.sql`** (the trigger only; the one-time recompute is NOT written — owner's decision). Director capital: a delete trigger that reverses the running balance (or forbid deletes), then a one-time recompute for Test School A | The balance trigger handles inserts only; deleted rows left a ৳13,14,000 drift | #681 |
| 2.5 | Per-payment receipts (payment history table) | `fee_collection_records` keeps one cumulative row per month, so a single payment cannot be receipted | Student portal plan, section 8 — no issue yet |

## 3. Exams and marks

| # | Change | Why | Detail |
|---|---|---|---|
| 3.1 | **APPLIED 2026-10-08: `0223_exam_marks_absent_and_atomic_save.sql`.** Nullable mark components and an `is_absent` flag on `exam_marks` | "Absent" cannot be told from "not entered"; a half-filled row (theory now, MCQ later) is refused | #679 |
| 3.2 | **APPLIED 2026-10-08: in `0223`.** One database function for the marks save (upsert + delete in one transaction) | The save runs two statements; a failure between them leaves half a save | #700 — do with 3.1, same code |
| 3.3 | **APPLIED 2026-10-08: `0224_exam_routine_no_class_overlap.sql`** (a trigger with a per-class lock, not an exclusion constraint; reasons in the file). Exclusion constraint on exam routine entries (class, date, time range) | The overlap check is in the app and inside one exam only | #699 — check existing overlaps first |
| 3.4 | **APPLIED 2026-10-08: `0222_cleanup_all_zero_exam_marks.sql`** (DATA CHANGE; open, unpublished exams only; set the cutoff first). **ops, then code** — clean up all-zero `exam_marks` rows saved before the marks-entry fix | They still count as entered and read as failed | #698 — do before or with 3.1 |
| 3.5 | Roll uniqueness per class + section + academic year: confirm the constraint, fix it if looser than intended | Two students were saved with roll 9001 in one class offering | #690 — investigate first; clean duplicates before adding |

## 4. Attendance and leave

| # | Change | Why | Detail |
|---|---|---|---|
| 4.0 | **APPLIED 2026-10-08: `0218_absent_day_skips_weekly_off_days.sql`** (the student-readable `weekly_off_days` part is NOT in it). **`is_absent_working_day` must skip the school's weekly off-days** (`schools.weekly_off_days`, 0 = Sunday … 6 = Saturday). `create or replace function`; `absent_working_days_in_range` and `student_absent_working_days` call it. Also let a student read their school's `weekly_off_days` so the portal calendar can mark those days | Observed on Test School A (weekly off-days Friday, Saturday): the function returned 1 absent day for Fri 2 Oct and 1 for Sat 3 Oct. A student present on 2 of 3 working days showed 40% instead of 67%, with a false "attendance low" alert. **The absence fine and the absence SMS rules use the same function**, so they are counting weekend days too | Found by the student portal evaluation — no issue yet. Check the fine and SMS effect before and after |
| 4.1 | **APPLIED 2026-10-08: `0219_leave_decision_note.sql`** (reason optional, max 500 characters). `decision_note` (rejection reason) and `decided_at` (when it was approved or rejected) on `student_leaves` and `employee_leaves` | Reject is a confirm-only click; no reason is stored or shown. With no decision time, the student home can only count its "leave rejected" alert from the request date, so a leave rejected more than 7 days after it was requested raises no alert | #680 |
| 4.2 | A way to tell "machine not synced" from "nobody came" (for example last successful sync time per machine). Not written: nothing in the data records a sync time, so this needs a new column, for example `attendance_machines.last_seen_at`, stamped by the sync route. `0220` only adds a "no record" state for days with no rows at all | A sync failure looks like a school full of absentees | #694 |
| 4.3 | A source marker on `off_days` for rows imported from the central holiday list | The new holiday list cannot label imported holidays | Raised while closing #692 — no issue yet |
| 4.4 | **APPLIED 2026-10-08: in `0218`** (function `student_class_attendance_days(p_start, p_end)`, dates only). A student-readable source for "days on which attendance was taken for my class" (a view or a definer function) | A student can read only their own attendance rows. The student home and attendance page therefore cannot tell "the school took no attendance this month" from "I was absent every day it was taken": both show "—" instead of 0% | Found while reviewing the student home dashboard — no issue yet |
| 4.5 | `absence_sms_candidates` walks the absence streak with its own inline copy of the off-day and leave conditions (0046) and does not skip weekly off-days. Give the walk the same clause as `is_absent_working_day` (or call it) | After `0218` no SMS is raised on a weekly off-day, but a streak across a weekend still counts Friday and Saturday (Thursday + Sunday absent reads as 4 days, not 2), so the wrong SMS rule can match | Found while writing `0218`. Changes which SMS is sent: needs the owner's approval |
| 4.6 | `revoke execute on function public.is_absent_working_day(uuid, uuid, date) from public, anon, authenticated` (every SQL caller is a definer function; no app code calls it directly). Change the anon call in `web/tests/integration/absence-sms.test.ts:114` in the same step | The function has had default grants since 0021, so an unauthenticated caller with a student id can ask whether that student had a record or approved leave on a date | Found by the review of `0218`–`0220`. Confirm the live grants first |
| 4.7 | Optional: in `student_class_attendance_days` (`0218`) limit the range to one year and leave out archived classmates (`c.archived_at is null`) | A Student can ask for any date range, including days before they joined; archived classmates still count as "class was marked" | Found by the same review. Can be edited into `0218` before it is applied |
| 4.8 | `student_absent_working_days` / `absent_working_days_in_range` (and `student_class_attendance_days`) should not count days before the student's current enrollment began | A student admitted on 8 Oct was shown 2 absent working days for 4 and 5 Oct and "attendance low 0%" on the first day. `0217`'s summary already clips to the enrollment day; these do not. Check the absent fine before changing: it uses the same count | Found in the 2026-10-08 browser test. Not written |

## 5. Notices and student portal

| # | Change | Why | Detail |
|---|---|---|---|
| 5.1 | `publications` status (or nullable `published_at`) and a student read policy limited to published rows | A notice cannot be unpublished without deleting it | #696 |
| 5.4 | `student_messages.parent_id` (or a `thread_id`) so a follow-up question belongs to its original, plus the teacher inbox grouping by it | The owner asked for follow-up questions. With no link column, the student portal groups follow-ups by convention (same anchor and same title), so two unrelated questions with one title merge, and the teacher sees each follow-up as a separate question without the earlier messages | Student questions rebuild, 2026-10-05 — no issue yet |
| 5.5 | Length limit on `student_messages.body` (a CHECK plus the same limit in `validateQuestion`) | The question body has no limit at all; the new editor cannot show a character counter and a student can post an unbounded text | Student questions rebuild — no issue yet |
| 5.6 | Several replies per question (a `student_message_replies` table, or messages as rows) | One `reply_body` per row: a teacher who replies twice overwrites or has nowhere to write. Goes with 5.4 | Student questions rebuild — no issue yet |
| 5.7 | Attachments on questions and follow-ups (`student_message_attachments` + a private storage bucket with policies: the student writes to their own folder, the class teacher and owner read). **Owner's rule (2026-10-05): at most 1 MB in total per question, all files together** — enforce it in the upload action and with a bucket file-size limit | The owner asked for file attachment on the question editor. There is nowhere to record a file against a question today, and images are deliberately not rendered from the question text (a student must not embed remote pictures) | Requested by the owner — no issue yet |
| 5.8 | A delete policy letting a student remove their own unanswered question | A question sent by mistake cannot be withdrawn; test rows cannot be cleaned up from the app | Student questions rebuild — product decision, no issue yet |
| 5.9 | A subject on homework and study material (`publications.subject_id`, and the same for the syllabus/material rows) | The student's Tasks and Materials tables cannot show or filter by subject: the rows carry no subject | Student lists as tables, 2026-10-05 — no issue yet |
| 5.2 | Per-student "read" marker for teacher replies to questions | "Answered but not yet seen" cannot be shown as an alert on the student home | Student portal plan, section 8 — no issue yet |
| 5.3 | One function returning the student home counters (overdue tasks, fee due, unread notices) | Only if the home's ~11 parallel reads measure slow | Student portal plan, section 8 — measure first |

## 6. Optional hardening

| # | Change | Why | Detail |
|---|---|---|---|
| 6.1 | CHECK on mobile number format (`^01[3-9]\d{8}$`) for students, guardians and employees | The app now validates new values; old invalid values (for example `abc123`) remain | Clean the data first, or the constraint cannot be added |
| 6.2 | CHECK on `full_name` length (100) | The form limits it; the column does not | Low priority |
| 6.3 | A real 404 for unknown `/school/...` routes | Not a database change; listed here because it reverses the fail-closed proxy choice of #515 | #697 — security decision |

## Suggested order

1. 0.1 and 0.2 (no code depends on them, and they clear the ground).
2. **4.0** (weekly off-days counted as absences — affects fines and SMS today), 1.2 (student results are broken for every student today) and 1.1 (closes the gap behind #676).
3. 2.1, then 2.2 and 2.4.
4. 3.4, then 3.1 with 3.2.
5. 4.1, 5.1, 1.3.
6. The rest, after the product decisions in 1.4, 1.6, 2.3 and 3.5.

## Rules for whoever implements these

- `staging` and production share one database: a migration applied to staging is live for production data.
- `staging` took `0214`–`0216` on 2026-10-07 (attendance local day, reconcile queue, agents), so this branch's files were renumbered. Next free migration number after this branch is `0221` (`0217` attendance summary draft, `0218`, `0219`, `0220` are written and not applied; apply in that order, on a branch database first; rollout notes in `docs/handoff/migrations-attendance-rollout.md`). Re-check before numbering; another developer is working on `staging`.
- Policies that narrow access (1.1, 1.4) need a check that the School Owner and office staff are unaffected. The app-level guards in `web/lib/school/exam-class-guard.ts` and `web/lib/auth/require-grant.ts` show the intended rule and have unit tests to mirror.
- `web/tests/integration/accounting-ii.test.ts` no longer deletes director capital rows (it settles with an opposite transaction). It still deletes vouchers and bank/cash rows as the owner.

## Change log

- 2026-10-04 — created with 20 items.
- 2026-10-04 — 4.1 extended with `decided_at` (found while building the student home dashboard).
- 2026-10-04 — 4.4 added: student-readable "attendance was taken" source. Total is now 21 items.
- 2026-10-05 — 4.0 added: weekly off-days counted as absences (fines and SMS affected). Moved to the front of the suggested order. Total is now 22 items.
- 2026-10-05 — 5.4 added: thread link on `student_messages` for follow-up questions. Total is now 23 items.
- 2026-10-05 — 5.5–5.8 added from the student questions rebuild (body length, several replies, attachments, student delete). 5.2 also covers "which reply is new". Total is now 27 items.
- 2026-10-05 — 5.9 added: subject on homework and study material. Total is now 28 items.
- 2026-10-05 — 5.7 changed from optional to requested by the owner, with the 1 MB total limit.
- 2026-10-07 — 4.0 and 4.4 written as `0218`, 4.1 as `0219`, 1.5 as `0220`; none applied. 4.2 narrowed to the missing sync-time column. 4.5 added: the SMS streak walk still counts weekly off-days. Total is now 29 items. Two existing integration tests (`absent-working-days-range.test.ts`, `fee-structures.test.ts`) assert the old weekend counting and must be updated when `0218` is applied.
- 2026-10-07 — after an independent review of `0218`–`0220`: 4.6 (anon can execute `is_absent_working_day`) and 4.7 (range and archived classmates) added. Total is now 31 items. The three files now end with a PostgREST schema reload; the `0219` rollback order is fixed; `0217` is re-runnable. `weekly_off_days` defaults to Saturday only: check each School before calling 4.0 fixed.
- 2026-10-07 — `staging` added its own `0214`–`0216`. This branch's four files were renumbered and every reference here updated: `0217` student attendance summary (#684), `0218` weekly off-days (4.0, 4.4), `0219` leave decision note (4.1), `0220` employee attendance start (1.5). None applied. Ranges reserved for work in progress: `0221`–`0229` exams, `0230`–`0239` fees, `0240`–`0249` access, `0250`–`0262` notices and portal.
- 2026-10-08 — exams and marks: 1.2 written as `0221`, 3.4 as `0222` (data change), 3.1 and 3.2 as `0223`, 3.3 as `0224`; none applied. Rollout notes in `docs/handoff/migrations-exams-rollout.md`. New needs found, not written: `student_exam_result` must left-join the exam's subjects (so an unmarked subject or a wholly unmarked exam reaches the portal); `student_exam_rank` should leave out students with a half-filled subject once `0223` is applied.
- 2026-10-08 — `0217`, `0218`, `0219`, `0220` applied to the shared database. Integration tests for them have not run yet.
- 2026-10-08 — written, not applied: `0221` (1.2 / #702), `0223` (#679, #700), `0224` (#699), `0250` (4.5), `0251` (4.7), `0252` (#696), `0253` (5.4), `0254` (5.6), `0255` (5.2), `0256` (5.5), `0257` (5.8). Rollout notes: `docs/handoff/migrations-exams-rollout.md`, `docs/handoff/migrations-notices-portal-rollout.md`. `0222` (#698 cleanup) was written and then removed: the database holds no all-zero marks row, so there is nothing to clean, and the file would have deleted real typed zeros if run later. 4.2 needs no migration: the read side uses `attendance_agents.last_heartbeat_at` from staging's `0216`.
- 2026-10-08 — new needs found: staff cannot delete a question or a reply; homework and study material cannot be unpublished (views `student_task`, `student_material`); `student_messages.reply_body` has no length limit; `student_exam_result` should left-join the exam's subjects; `student_exam_rank` treats a half-filled subject as 0 once `0223` is applied; routine is not re-checked when `exams.class_id` changes; no sync signal for schools on the legacy ingest-token path.
- 2026-10-08 — 2.1, 2.2 and 2.4 written as `0230`, `0231`, `0232`; none applied. 2.3 (#695): the acknowledgement is kept, no migration. New items found and not written: the fee ledger posting counts the fine twice when the received amount includes it; `bank_cash_transactions` has the same insert-only balance as director capital; vouchers / bank / capital ledger postings are insert-only. Details in `docs/handoff/migrations-fees-rollout.md`.
- 2026-10-08 — applied to the shared database: `0230` (2.1), `0250` (4.5), `0251` (4.7). Declined at the connector's confirmation step and still not applied: `0221`, `0223`; not attempted after that: `0224`, `0231`, `0232`, `0252`–`0257`.
- 2026-10-08 — people and access, written, not applied: `0240` (#677, employee-side attendance writes for Owner and office staff only; also closes ungranted writes on office-hour and grace tables), `0241` (#688, `profiles.login_disabled_at` + `set_staff_login_disabled`), `0242` (#688, optional: `app_current_school_id()` ignores a disabled login), `0243` (#689, approvals scoped to reach), `0244` (#690, roll edit trigger), `0245` (4.6, revoke `is_absent_working_day`). Rollout note: `docs/handoff/migrations-access-rollout.md`. New needs: `app_current_employee_id()` ignores archived rows, so an archived teacher's login counts as office staff; roll is stored twice (student row and enrollment); `employee_leaves` and employee attendance rows are not narrowed for teachers in RLS.
- 2026-10-08 — the owner ran `docs/handoff/apply-wave2.sql`: `0221`, `0223`, `0224`, `0231`, `0232`, `0240`, `0241`, `0243`, `0244`, `0245`, `0252`–`0257` are applied and were checked read-only (columns, functions, triggers, policies, tables). Not applied: optional `0242`. Every migration file on this branch except `0242` is now in the shared database.
- 2026-10-08 — 4.8 added: absences counted before the admission day.

## Source

Owner workflow audit (`docs/testing/owner-workflow-audit-2026-10-03/`), fix wave 1 on `merge/staging-sync`, and the student portal plan (`docs/testing/student-portal-audit-2026-10-04/implementation-plan.md`, section 8).
