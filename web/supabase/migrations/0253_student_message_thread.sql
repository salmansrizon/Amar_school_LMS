-- 0253_student_message_thread.sql
-- Issue #703 item 5.4: a follow-up question belongs to its original.
-- DRAFT: written by an agent, applied by hand after review. One nullable
-- column, one index, one trigger. No row is rewritten or deleted. Safe to run
-- twice.
--
-- WHAT
--   student_messages.thread_id uuid, null by default, referencing
--   student_messages(id).
--     NULL          = a row written before this migration, or by app code that
--                     does not know the column. Grouped as today (same anchor
--                     and same title: lib/student/question-threads.ts).
--     = the row's id = a new original question (the app sets it on insert).
--     = another id   = a follow-up to that original.
--   A trigger refuses a thread_id that is not an original question of the
--   SAME Student.
--
-- WHY
--   Follow-ups are grouped by convention (same anchor, same title), so two
--   unrelated questions with one title merge, and the teacher's inbox shows a
--   follow-up without the earlier messages.
--
-- CHOICES
--   * thread_id, not parent_id: with "= own id" a NEW original is told apart
--     from an OLD row without touching any old row. Old rows keep the title
--     convention; new rows never merge by title.
--   * No backfill: which old rows are follow-ups is only a guess (the title
--     convention). They stay NULL.
--   * The app sets thread_id, not a column default or trigger: app code
--     deployed before this file keeps writing NULL and keeps today's grouping.
--   * ON DELETE SET NULL: if an original is removed (item 5.8 lets a Student
--     withdraw an unanswered question) its follow-ups stay, as old-style rows.
--
-- WHO MAY READ / WRITE WHAT
--   No policy changes. A Student still reads and inserts only their own rows
--   (0148: student_id = app_current_student_id()). The new trigger adds that a
--   Student cannot attach a question to somebody else's thread: the original
--   must have the same student_id as the new row. Staff reads are unchanged
--   (0152).
--
-- EFFECT ON EXISTING DATA
--   None: every existing row gets NULL (nullable column, no default, no table
--   rewrite). The Student's list groups them exactly as before.
--
-- THE APP BEFORE AND AFTER
--   Before: the app reads without the column and, on insert, retries without
--   it when the column is missing (PGRST204 / 42703): today's behaviour.
--   After: new questions carry thread_id; the Student's list groups by it, and
--   the teacher's drawer shows the earlier messages of the same thread.
--
-- PRE-CHECK (read-only)
--   -- 1. Column absent (expect no rows):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'student_messages' and column_name = 'thread_id';
--   -- 2. Row count, for the record (nothing is changed):
--   select count(*) from student_messages;
--
-- ROLLBACK (trigger and function first: the function names the column)
--   drop trigger if exists student_message_thread on public.student_messages;
--   drop function if exists public.enforce_student_message_thread();
--   drop index if exists public.student_messages_thread_idx;
--   alter table public.student_messages drop column if exists thread_id;
--   notify pgrst, 'reload schema';
--   The app falls back to the title convention. Thread links stored in between
--   are lost; follow-ups with the same title still group as before.

alter table public.student_messages
  add column if not exists thread_id uuid references public.student_messages (id) on delete set null;

comment on column public.student_messages.thread_id is
  'The original question this row belongs to (#703 item 5.4). NULL = written before 0253 (grouped by anchor and title). Equal to id = an original question. Another id = a follow-up to it.';

create index if not exists student_messages_thread_idx on public.student_messages (thread_id);

-- A follow-up may only point at an original question of the same Student.
-- Definer so the lookup does not depend on which policies the writer has; it
-- reads one row by primary key and returns nothing to the caller.
create or replace function public.enforce_student_message_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.thread_id is null or new.thread_id = new.id then
    return new;
  end if;
  if not exists (
    select 1 from student_messages root
     where root.id = new.thread_id
       and root.student_id = new.student_id
       and root.school_id = new.school_id
       -- The target is itself an original: an old row (NULL) or a new one.
       and (root.thread_id is null or root.thread_id = root.id)
  ) then
    raise exception 'thread does not belong to this student';
  end if;
  return new;
end $$;

-- Trigger functions need no EXECUTE for anyone (0150 section 1).
revoke execute on function public.enforce_student_message_thread() from public, anon, authenticated;

drop trigger if exists student_message_thread on public.student_messages;
create trigger student_message_thread
  before insert or update of thread_id on public.student_messages
  for each row execute function public.enforce_student_message_thread();

notify pgrst, 'reload schema';
