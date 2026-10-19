-- 0255_student_message_reads.sql
-- Issue #703 item 5.2: which reply has the Student not seen yet.
-- DRAFT: written by an agent, applied by hand after review. One new table with
-- its policies. No existing table, row or policy is changed. Safe to run twice.
--
-- WHAT
--   student_message_reads: one row per question the Student has opened, with
--   the time they last opened it (seen_at). A reply is "new" when it is later
--   than seen_at, or when there is no row.
--
-- WHY
--   "Answered but not yet seen" cannot be shown: nothing records that the
--   Student has read a reply.
--
-- CHOICES
--   * A separate table, not a column on student_messages. A Student has no
--     UPDATE on student_messages by design (0148: the reply and the status
--     live on that row), and ANY update of an old answered row would make the
--     0154 trigger stamp replied_at = now() on rows answered without a time,
--     inventing reply times in the response report.
--   * The Student writes their own marker directly under RLS; no definer
--     function is needed.
--   * No backfill. The app counts a reply as new only for 14 days
--     (NEW_REPLY_DAYS in lib/student/question-threads.ts), so on the day this
--     is applied a Student sees "new reply" only on replies of the last two
--     weeks, not on their whole history.
--
-- WHO MAY READ / WRITE WHAT
--   Student: select, insert and update ONLY rows whose student_id is their own
--     (student_id = app_current_student_id() in USING and WITH CHECK), and
--     only for a question that is their own (the EXISTS on student_messages,
--     which itself runs under "student reads own messages"). No delete.
--   Staff: nothing. Whether a Student has read a reply is not shown to the
--     School in this change.
--   Super Admin: all. anon: nothing.
--
-- EFFECT ON EXISTING DATA
--   None. A new, empty table.
--
-- THE APP BEFORE AND AFTER
--   Before: the read fails (PGRST205 / 42P01) and is treated as "unknown": no
--   "new reply" mark anywhere, as today. The write is skipped silently; it
--   stores nothing the Student typed.
--   After: the Student's question list marks conversations with a new reply,
--   and opening one clears the mark.
--
-- PRE-CHECK (read-only)
--   select to_regclass('public.student_message_reads');   -- expect null
--
-- ROLLBACK (the markers are lost; nothing else depends on them)
--   drop table if exists public.student_message_reads;
--   notify pgrst, 'reload schema';

create table if not exists public.student_message_reads (
  message_id uuid primary key references public.student_messages (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  seen_at timestamptz not null default now()
);

comment on table public.student_message_reads is
  'When a Student last opened one of their own questions (#703 item 5.2). A reply later than seen_at is new to them.';

create index if not exists student_message_reads_student_idx on public.student_message_reads (student_id);

alter table public.student_message_reads enable row level security;
revoke all on public.student_message_reads from anon;

drop policy if exists "student reads own message reads" on public.student_message_reads;
create policy "student reads own message reads" on public.student_message_reads
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student marks own message read" on public.student_message_reads;
create policy "student marks own message read" on public.student_message_reads
  for insert with check (
    student_id = public.app_current_student_id()
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and m.student_id = public.app_current_student_id()
    )
  );

drop policy if exists "student updates own message read" on public.student_message_reads;
create policy "student updates own message read" on public.student_message_reads
  for update using (student_id = public.app_current_student_id())
  with check (
    student_id = public.app_current_student_id()
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and m.student_id = public.app_current_student_id()
    )
  );

drop policy if exists "super admin manages student message reads" on public.student_message_reads;
create policy "super admin manages student message reads" on public.student_message_reads
  for all using (public.app_current_role() = 'super_admin');

notify pgrst, 'reload schema';
