-- 0216_leave_decision_note.sql
-- #680: record WHY and WHEN a leave request was decided.
--
-- What: decision_note (optional reason, shown to the requester) and decided_at
--   (when it was approved or rejected) on student_leaves and employee_leaves.
-- Why: rejecting a leave was a bare confirm click; the Student never learned
--   why, and the Student portal's "leave rejected" alert had to count its 7
--   days from created_at, so a leave rejected late raised no alert.
-- Length: decision_note <= 500 characters. A reason is a sentence or two; the
--   cap keeps the portal alert and table cells sane, and the UI textarea uses
--   the same number.
-- Backfill: none. decided_at is unknown for rows decided before this migration
--   and stays NULL; the portal falls back to created_at for those.
-- Policies: existing row-level policies need no change. Staff already hold
--   "for all" on both tables (0021, 0046, screen grants 0136), so they may write
--   the new columns. A Student has select (0146 "student reads own leave", so
--   the note is readable on their own row), insert, and delete-while-pending
--   only; there is no UPDATE policy, so the only write path is INSERT, closed
--   by the trigger below.
-- Rollback (in this order: the function first, because its body names the
--   columns and every insert into student_leaves runs it):
--   create or replace function public.enforce_student_leave_pending() returns trigger
--   language plpgsql security definer set search_path = public as $$
--   begin
--     if public.app_current_role() = 'student' and new.status is distinct from 'pending' then
--       raise exception 'a student may only create a pending leave request';
--     end if;
--     return new;
--   end $$;
--   alter table public.student_leaves  drop column if exists decision_note, drop column if exists decided_at;
--   alter table public.employee_leaves drop column if exists decision_note, drop column if exists decided_at;
-- Idempotent.

alter table public.student_leaves
  add column if not exists decision_note text check (char_length(decision_note) <= 500),
  add column if not exists decided_at timestamptz;

alter table public.employee_leaves
  add column if not exists decision_note text check (char_length(decision_note) <= 500),
  add column if not exists decided_at timestamptz;

-- A Student-created row is a bare request: no decision, no note. The insert
-- policy's WITH CHECK does not mention these columns, so the trigger is what
-- stops a Student inserting a row that already looks decided.
create or replace function public.enforce_student_leave_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() = 'student' and new.status is distinct from 'pending' then
    raise exception 'a student may only create a pending leave request';
  end if;
  if public.app_current_role() = 'student'
     and (new.decision_note is not null or new.decided_at is not null) then
    raise exception 'a student cannot set a leave decision';
  end if;
  return new;
end $$;

-- PostgREST learns the new shape at once; otherwise the app keeps taking its
-- "not applied yet" fallback until the schema cache reloads by itself.
notify pgrst, 'reload schema';
