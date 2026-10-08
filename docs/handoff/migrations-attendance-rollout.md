# Attendance migrations — rollout notes (written, not applied)

Plan: `plan-2026-10-06-attendance-migrations.md`. Apply order 0217 → 0218 →
0219 → 0220, on a branch database first. Each section below is appended by its
own package.

## 0218_absent_day_skips_weekly_off_days.sql

Issue #703 items 4.0 and 4.4. File:
`web/supabase/migrations/0218_absent_day_skips_weekly_off_days.sql`.

### What it does

1. Replaces `is_absent_working_day(sid uuid, school uuid, d date)`. One added
   condition: a day whose weekday is in `schools.weekly_off_days` is not an
   absent working day. Signature, `language sql`, `stable`, `security definer`,
   `search_path = public` and privileges are as in 0046. No grant or revoke
   statement is issued for it.
2. Adds `student_class_attendance_days(p_start date, p_end date) returns setof
   date`: the days attendance was taken for the calling Student's class.
   Definer, `search_path = public`, execute revoked from `public` and `anon`,
   granted to `authenticated`.

No table, column, policy or row changes. Both statements are
`create or replace`, so the file can be run twice.

### The rule

- Weekday numbers: 0 = Sunday .. 6 = Saturday (`extract(dow from d)`, the same
  numbers as JS `getUTCDay()` used by `dayOffInfo` in
  `web/lib/attendance-manual.ts`).
- The weekday is that of the calendar date. No time zone takes part.
- `weekly_off_days` NULL reads as `{6}` (as `getSchoolContext` does). The
  column is `not null default '{6}'`, so this never happens in stored data.
- An empty array skips nothing.
- A day with an attendance record is never absent, off-day or not (unchanged).

### Prerequisites

- 0206 (`schools.weekly_off_days`) applied. It is, on the shared database.
- 0146 and 0177/0178 applied (`app_current_student_id`, `student_enrollments`,
  `students.current_enrollment_id`).
- 0217 is not required by 0218. Keep the number order anyway.
- The app code on this branch can be deployed before or after: while the new
  function is missing the student pages show what they show today.

### Check before applying

1. Each School's weekly off-days are what the School means. The default is
   Saturday only; a School that never opened the Off-Days setting has `{6}`,
   so its Fridays will still count as absences after this migration.

   ```sql
   select id, name, weekly_off_days from schools order by name;
   ```

2. How many student-days this month stop being absences, per School. Run it
   BEFORE applying: it asks the old function which weekly off-days it counts.

   ```sql
   with today as (select (now() at time zone 'Asia/Dhaka')::date as d),
   days as (
     select (date_trunc('month', t.d)::date + n) as day
       from today t, generate_series(0, 30) n
      where date_trunc('month', t.d)::date + n <= t.d
   )
   select sc.id, sc.name, sc.weekly_off_days,
          count(*) as student_days_no_longer_absent,
          count(distinct s.id) as students_affected
     from schools sc
     join students s on s.school_id = sc.id and s.archived_at is null
    cross join days
    where extract(dow from days.day)::int = any (coalesce(sc.weekly_off_days, '{6}'::smallint[]))
      and public.is_absent_working_day(s.id, sc.id, days.day)
    group by sc.id, sc.name, sc.weekly_off_days
    order by student_days_no_longer_absent desc;
   ```

   Expect roughly (active Students) x (weekly off-days so far this month),
   less off-day rows, approved leave and records on those days.

3. `\df+ public.is_absent_working_day` — note the access privileges column so
   it can be compared afterwards.

### Who calls it, and what changes

| Caller | Where | Produces | After 0218 |
|---|---|---|---|
| `absent_working_days_in_month` | 0039; `calculateAbsentFine` in `web/app/school/fees/actions.ts`, called by the Calculate button in `web/app/school/fees/fee-form.tsx` | Absent day count, and count x `fine_per_absent_day` put into the fine field | Lower by the number of weekly off-days in the month the Student has no record on (4 to 9 days in a Fri+Sat School). The fine suggested from now on is lower. |
| `absent_working_days_in_range` | 0146; `web/lib/progress-report-data.ts` (progress report and print-all) | Attendance % on the progress report | Higher: weekly off-days leave the denominator. |
| `student_absent_working_days` | 0146; `web/app/student/page.tsx`, `web/app/student/attendance/page.tsx` | Student's absent days and attendance % | Fewer absent days, higher % (the 40% case reads 67%). |
| `absence_sms_candidates` | 0046; `web/app/api/sms/absence/route.ts`, daily cron `0 13 * * *` UTC in `web/vercel.json` | Guardians to text, with a streak length | No candidate is produced when the target date is a weekly off-day. On other days the list is the same. See the gap below. |

**Stored values do not change.** A fine typed or calculated into a fee record
before the migration stays as saved (`fee_collection_records.fine_amount`); it is only
recalculated if someone presses Calculate again and saves. SMS already sent
stay in `sms_log`. Progress reports and the student pages are computed on
read, so they change at once.

**Gap left open, on purpose.** `absence_sms_candidates` calls
`is_absent_working_day` only for the target date. For earlier days it walks
back with its own copy of the off-day and leave conditions (0046, the
`streaks` CTE) and that copy does not know weekly off-days. So after 0218:

- on a Friday or Saturday (off-days) no absence SMS is raised: fixed;
- a streak that crosses a weekend still counts the weekend. Absent Thursday
  and Sunday reads as a streak of 4, not 2, so an "exactly 2 days" rule does
  not fire and a "3 to 4 days" rule does.

Fixing the walk changes which rule matches and so which texts are sent. It
needs its own migration and the owner's yes.

**Existing integration tests that will need new numbers once 0218 is applied**
(Test School A has `weekly_off_days = {6}`; both use Sat 2026-07-04):

- `web/tests/integration/absent-working-days-range.test.ts`: the count over
  07-01..07-05 becomes 3 (was 4); the leave over 07-04..07-05 removes 1 day
  (was 2).
- `web/tests/integration/fee-structures.test.ts`: the same leave removes 1
  day from the month count (was 2).

### Check after applying

1. `\df+ public.is_absent_working_day`: same argument types
   `(uuid, uuid, date)`, result `boolean`, `stable`, security definer, and the
   same access privileges as noted before.
2. A Saturday is no longer absent for a Student with no record:

   ```sql
   select s.id, public.is_absent_working_day(s.id, s.school_id, date '2026-10-03') as sat,
                public.is_absent_working_day(s.id, s.school_id, date '2026-10-04') as sun
     from students s where s.archived_at is null limit 5;
   -- sat = false everywhere {6} is set; sun as before.
   ```

3. Query 2 from "Check before" now returns no rows.
4. `select has_function_privilege('anon', 'public.student_class_attendance_days(date, date)', 'execute');`
   is false; the same for `authenticated` is true.
5. Sign in as a Student: the attendance page shows a percentage over the days
   the class was marked, and a marked day with no record of their own is a red
   "absent" cell. A month the class was never marked still shows "—" and the
   "school has not taken attendance" message.
6. Run `web/tests/integration/absent-day-weekly-off.test.ts` against a branch
   database (it was written for 0218 and has not been run).

### How the student pages use it

`web/lib/student/attendance-source.ts` calls `student_class_attendance_days`
and returns null on any error or unusable reply. `attendanceOutcome` in
`web/lib/student/attendance.ts` then decides:

- null or no rows: as before 0218 (the RPC's absent count; no percentage
  without a present row);
- at least one taken day: percentage = present / (present + taken days with no
  record); those days are the absent cells.

"Taken" means: some Student currently enrolled in the caller's Class Offering
has an attendance record, or an absence note written by a hand-marked register,
that day. Limits: a machine-only class where nobody tapped in looks untaken;
classmates are today's classmates, also for past months; a Student with no
current Enrollment gets no rows and so the old behaviour.

The Student's absent figure is now the count of taken days missed. It can be
lower than the fine's count for the same month, because the fine still counts
working days on which nobody was marked.

### Rollback

Run the block in the migration's header: it restores the 0046 body of
`is_absent_working_day` and drops `student_class_attendance_days`. No app
change is needed; the student pages fall back by themselves. Numbers computed
on read go back to the old values; fines saved in between keep the lower
amount.

## 0219

`web/supabase/migrations/0219_leave_decision_note.sql` (#680). Adds `decision_note text` (CHECK length <= 500) and `decided_at timestamptz` to `student_leaves` and `employee_leaves`, and extends `enforce_student_leave_pending()` so a Student-created row must have both null.

Prerequisites: none (independent of 0217, 0218, 0220). It replaces the function from 0146 and needs `app_current_role()` (exists).

Before applying (branch database):
- Confirm the columns are absent: `select column_name from information_schema.columns where table_name in ('student_leaves','employee_leaves') and column_name in ('decision_note','decided_at');` returns no rows.
- Confirm the app already works: approve, undo and reject a test leave in the owner UI; the Student leave page shows it with no reason line. (The code retries without the new columns when it sees `PGRST204` or `42703`.)

After applying:
- Reload the PostgREST schema cache (`notify pgrst, 'reload schema'`) if the API does not see the columns.
- Same columns now present on both tables; existing rows have both null (no backfill: the decision time of old leaves is unknown, so the portal alert keeps counting from `created_at` for them).
- Reject a test leave with a reason: owner drawer and table show the reason and "Decided on"; the Student leave page shows the reason and date; the Student home alert counts 7 days from the decision.
- Approve a rejected-then-reverted leave: the note is cleared.
- Run `tests/integration/leave-decision-note.test.ts` (written for this migration, not yet run).
- Leaves decided through the workflow engine (0105 sync) update only `status`, so `decided_at` stays null for them.

Rollback, in this order (the block is in the migration's header): first re-create `enforce_student_leave_pending()` with its 0146 body, then drop `decision_note` and `decided_at` from both tables. The other order breaks every insert into `student_leaves` in between, because the function body names the columns. The app keeps working (it falls back to status-only updates and reads). Stored reasons are lost on rollback.

Make the reject reason mandatory: set `REJECT_REASON_REQUIRED = true` in `web/lib/leave-columns.ts` (the dialog and the action both read it). Do that only after 0219 is applied, otherwise a required reason is accepted but not stored.

## 0220 — `employee_attendance_starts()` (#693, #694)

File: `web/supabase/migrations/0220_employee_attendance_start.sql`. One new
function, no table/view/policy change. No machine-sync column was added: the
data holds no per-machine last-contact time, so the "no record" state is
derived from `attendance_records` alone (no Employee recorded that day).

**Prerequisites.** 0136 (`app_module_granted`), 0138 era helpers
(`app_current_school_id`), `employees.joining_date` (0046). Independent of
0217–0219.

**Before applying.**
1. Log in as the School Owner and as a class teacher / staff user holding the
   `attendance` grant. On Attendance > Employees > Calendar, pick a month where
   an employee joined mid-month. Note both "absent" counts: the owner's is
   clipped, the teacher's is not (the observed bug: 11 vs 10).
2. Note which past working days read "No record" (days nobody was recorded).

**Apply**, then check.
- As the class teacher, reload the same month: the absent count equals the
  owner's; days before an employee's start day are blank, not "absent".
- Daily table (`?view=table&date=…`) and one employee's own calendar agree.
- A staff user WITHOUT the `attendance` grant: `select * from
  employee_attendance_starts()` returns zero rows.
- Owner: nothing changes (they read the same start days as before). This is true of start days only. The "No record" state is app code and is live on deploy, with or without 0220: a past working day on which no employee has any record reads "No record" with no rate, where it read everyone absent at 0%, so absent totals for such months drop. The Employees directory keeps "Not in yet" for today.
- "No record" days are the same before and after (app logic, not SQL).

**Expected change.** Only non-owner `attendance`-grant roles: fewer false
absences for days before an employee's start day.

**Rollback.** `drop function if exists public.employee_attendance_starts();`
The app falls back to its direct `employees` read on a missing function, so
this is safe at any time and nothing else needs reverting.

**Integration test.** `web/tests/integration/employee-attendance-starts.test.ts`
was written for this migration and has NOT been run; run it on the branch
database after applying.

## Notes from the review of 0218–0220 together (2026-10-07)

- Each of the three files ends with `notify pgrst, 'reload schema';`. Without a reload the app keeps its "not applied yet" fallback; for 0219 that means a typed reject reason is not stored although the reject succeeds.
- `weekly_off_days` defaults to `{6}` (Saturday only, 0206). A School that never set its weekly off-days still has Fridays counted as absences after 0218. Check each School's setting before describing 0218 as the fix.
- Integration expectations that change once 0218 is applied (if Test School A is `{6}`): `absent-working-days-range.test.ts:52` (4 becomes 3), `:73` and `fee-structures.test.ts:208` (`before - 2` becomes `before - 1`).
- `absent-day-weekly-off.test.ts` updates `schools.weekly_off_days` for Test School A while it runs; on the shared database that changes that School's computed figures for the duration.
- The workflow engine (0105) changes a leave's `status` only, so `decided_at` and `decision_note` can go stale on a workflow-driven change.
- Not in these files, recorded in #703: `is_absent_working_day` is executable by `anon` (since 0021); `student_class_attendance_days` takes any date range and includes archived classmates.
