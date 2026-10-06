# Attendance and leave migrations: rollout notes

Written, not applied. Apply in order 0214, 0215, 0216, 0217 on a branch database first. Each section below is self-contained.

## 0216

`web/supabase/migrations/0216_leave_decision_note.sql` (#680). Adds `decision_note text` (CHECK length <= 500) and `decided_at timestamptz` to `student_leaves` and `employee_leaves`, and extends `enforce_student_leave_pending()` so a Student-created row must have both null.

Prerequisites: none (independent of 0214, 0215, 0217). It replaces the function from 0146 and needs `app_current_role()` (exists).

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

Rollback: `alter table public.student_leaves drop column if exists decision_note, drop column if exists decided_at;` the same for `employee_leaves`, then re-create `enforce_student_leave_pending()` as in 0146 section 3. The app keeps working (it falls back to status-only updates and reads). Stored reasons are lost on rollback.

Make the reject reason mandatory: set `REJECT_REASON_REQUIRED = true` in `web/lib/leave-columns.ts` (the dialog and the action both read it). Do that only after 0216 is applied, otherwise a required reason is accepted but not stored.
