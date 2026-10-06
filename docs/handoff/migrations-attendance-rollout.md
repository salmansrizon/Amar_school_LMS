# Attendance migrations — rollout notes (written, not applied)

Plan: `plan-2026-10-06-attendance-migrations.md`. Apply order 0214 → 0215 →
0216 → 0217, on a branch database first. Each section below is appended by its
own package.

## 0217 — `employee_attendance_starts()` (#693, #694)

File: `web/supabase/migrations/0217_employee_attendance_start.sql`. One new
function, no table/view/policy change. No machine-sync column was added: the
data holds no per-machine last-contact time, so the "no record" state is
derived from `attendance_records` alone (no Employee recorded that day).

**Prerequisites.** 0136 (`app_module_granted`), 0138 era helpers
(`app_current_school_id`), `employees.joining_date` (0046). Independent of
0214–0216.

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
- Owner: nothing changes (they read the same start days as before).
- "No record" days are the same before and after (app logic, not SQL).

**Expected change.** Only non-owner `attendance`-grant roles: fewer false
absences for days before an employee's start day.

**Rollback.** `drop function if exists public.employee_attendance_starts();`
The app falls back to its direct `employees` read on a missing function, so
this is safe at any time and nothing else needs reverting.

**Integration test.** `web/tests/integration/employee-attendance-starts.test.ts`
was written for this migration and has NOT been run; run it on the branch
database after applying.
