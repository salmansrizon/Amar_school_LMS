# Plan — attendance and leave issues, with migrations written but not applied

Written 2026-10-06. Owner's decisions for this wave: (1) agents **write**
migrations and the code that uses them; **nothing is applied** to the
database (staging and production share it); (2) scope is the attendance and
leave group only. Exams, fees, people/notices groups wait.

## Rules for every package

- Branch from `merge/staging-sync`; commit on the worktree branch; never push.
- A migration is a new file under `web/supabase/migrations/` with the number
  assigned below (no other numbers, to avoid collisions). Idempotent where the
  repo's migrations are (`create or replace`, `add column if not exists`,
  `drop policy if exists`). Header comment: what, why, issue, how to roll back.
- **The app must work both before and after the migration is applied.** New
  columns and functions are optional to the code: on "column / function not
  found" it falls back to today's behaviour. Pattern already in the repo:
  `web/lib/school/attendance-rate-source.ts` (returns null until 0214 exists).
- Never run a migration, `supabase db push`, SQL against the database, the
  integration suite or e2e specs. Integration tests for the new SQL are
  written beside the existing ones and marked as not run.
- A rollout note per migration in `docs/handoff/migrations-attendance-rollout.md`:
  order, what to check before and after, expected change in numbers, rollback.
- Unit tests for all new pure logic; typecheck, eslint, unit suite green.
- jev: `jev_review` on raw diffs (SQL included), `jev_verify` on claims.
- Update #703's source file is done by the coordinator, not the agents.

## Packages

| # | Migration | Issues | Work | Owns |
|---|---|---|---|---|
| M1 | `0215_absent_day_skips_weekly_off_days.sql` | #703 item 4.0, 4.4 | `is_absent_working_day` skips `schools.weekly_off_days`; new student-callable function returning the days on which attendance was taken for the student's class. Student attendance page and home use it when present (so "absent every marked day" reads 0%, and "no attendance taken" stays "—"). Report which fines and SMS paths call the function and how their numbers change. | the SQL file; `web/lib/student/attendance*.ts`; `web/app/student/attendance/**`; the attendance part of `web/app/student/page.tsx`; integration test file |
| M2 | `0216_leave_decision_note.sql` | #680 | `decision_note` and `decided_at` on `student_leaves` and `employee_leaves`; reject asks for a reason (optional or required per the issue's open question — default optional); approve/reject/revert stamp or clear `decided_at`; the reason shows on the owner's leave drawer and on the student's leave page; the student home's "leave rejected" alert uses `decided_at` when present. | the SQL file; `web/app/school/attendance/manual-actions.ts` (leave actions only); `web/app/school/attendance/leave/**`; `web/app/student/leave/**`; the leave part of `web/lib/student/dashboard.ts` |
| M3 | `0217_employee_attendance_start.sql` | #693, #694 | A definer function giving each employee's attendance start day to callers who hold the attendance grant, so "no absence before joining" also works for non-owner roles; the employee pages use it when present and fall back to today's read. "No record / machine not synced" state on the employee calendar, table and list: find what the data can already tell (last sync time per machine); add a column only if nothing exists. | the SQL file; `web/app/school/attendance/employee/**`; `web/app/school/employees/[id]/attendance/**`; `web/lib/employee-attendance-calendar.ts`; `web/lib/attendance.ts` |

## After the packages

1. Coordinator reads each diff (SQL first), merges, runs checks, runs jev on
   the raw SQL, updates #703 (items marked "written, not applied" with the
   file name) and the issues.
2. An independent reviewer checks the three migrations together: order,
   idempotence, policies, definer functions' `search_path`, grants, and that
   the app behaves the same before they are applied.
3. The owner or the other developer applies them, in order 0214 → 0215 →
   0216 → 0217, on a branch database first.
