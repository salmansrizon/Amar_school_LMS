-- 0254_student_message_replies.sql
-- Issue #703 item 5.6: several replies per question.
-- DRAFT: written by an agent, applied by hand after review. One new table with
-- its policies and one trigger. No existing table, row or policy is changed.
-- Safe to run twice.
--
-- WHAT
--   student_message_replies: one row per ADDITIONAL reply to a question.
--   The first reply stays where it is today, in student_messages.reply_body /
--   replied_by / replied_at; "answered" keeps its one definition (0153).
--
-- WHY
--   student_messages holds one reply per row. A teacher who wants to add to an
--   answer has nowhere to write, short of overwriting the first reply.
--
-- CHOICES
--   * Additional replies only. Moving the first reply into this table would
--     mean rewriting every answered row and every reader of reply_body
--     (inbox, response report, student home). Not done.
--   * A further reply does not change status or replied_at, so the response
--     report's reply times are unaffected.
--   * Body limit 4000 characters, the same number as item 5.5 (0256).
--   * Replies are not edited or deleted by School roles (no update or delete
--     policy), like the first reply's history.
--
-- WHO MAY READ / WRITE WHAT
--   Student: SELECT only, and only replies to their OWN questions. Enforced by
--     the policy "student reads replies to own messages": the reply's
--     student_id must equal app_current_student_id(). student_id is not
--     trusted from the writer: the trigger below copies it (and school_id)
--     from the question on every insert. A Student has no insert, update or
--     delete policy here.
--   Staff: SELECT a reply when they can read its question (the 0152 read rule
--     applies through the sub-select on student_messages, which runs under the
--     reader's own policies). INSERT only when staff_may_answer_message(id)
--     says they may answer that question (0152, ADR 0018), as themselves
--     (replied_by = auth.uid()), and only on a question that already has its
--     first reply.
--   Super Admin: all, as on student_messages.
--   anon: nothing.
--
-- EFFECT ON EXISTING DATA
--   None. A new, empty table.
--
-- THE APP BEFORE AND AFTER
--   Before: the reads of this table fail (PGRST205 / 42P01) and are treated as
--   "no further replies"; the "add a reply" form is not shown, and the action
--   returns a clear error instead of overwriting the first reply.
--   After: the teacher's drawer offers "add a reply" on an answered question;
--   the Student's conversation shows every reply in order.
--
-- PRE-CHECK (read-only)
--   -- 1. Table absent (expect null):
--   select to_regclass('public.student_message_replies');
--   -- 2. The helper this file relies on exists (expect one row each):
--   select proname from pg_proc where proname in ('staff_may_answer_message', 'app_current_student_id');
--
-- ROLLBACK (stored additional replies are lost; first replies are untouched)
--   drop table if exists public.student_message_replies;
--   drop function if exists public.stamp_student_message_reply_owner();
--   notify pgrst, 'reload schema';

create table if not exists public.student_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.student_messages (id) on delete cascade,
  -- Copied from the question by the trigger below; never taken from the writer.
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  body text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  replied_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.student_message_replies is
  'Additional replies to a student question (#703 item 5.6). The first reply stays in student_messages.reply_body.';

create index if not exists student_message_replies_message_idx
  on public.student_message_replies (message_id, created_at);
create index if not exists student_message_replies_student_idx
  on public.student_message_replies (student_id);

-- school_id and student_id always come from the question itself.
create or replace function public.stamp_student_message_reply_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select m.school_id, m.student_id into new.school_id, new.student_id
    from student_messages m where m.id = new.message_id;
  if new.school_id is null then
    raise exception 'question not found';
  end if;
  return new;
end $$;

revoke execute on function public.stamp_student_message_reply_owner() from public, anon, authenticated;

drop trigger if exists student_message_reply_owner on public.student_message_replies;
create trigger student_message_reply_owner
  before insert on public.student_message_replies
  for each row execute function public.stamp_student_message_reply_owner();

alter table public.student_message_replies enable row level security;
revoke all on public.student_message_replies from anon;

drop policy if exists "student reads replies to own messages" on public.student_message_replies;
create policy "student reads replies to own messages" on public.student_message_replies
  for select using (student_id = public.app_current_student_id());

drop policy if exists "staff read replies to readable messages" on public.student_message_replies;
create policy "staff read replies to readable messages" on public.student_message_replies
  for select using (
    school_id = (select public.app_current_school_id())
    and exists (select 1 from public.student_messages m where m.id = message_id)
  );

drop policy if exists "staff add replies to answerable messages" on public.student_message_replies;
create policy "staff add replies to answerable messages" on public.student_message_replies
  for insert with check (
    school_id = (select public.app_current_school_id())
    and replied_by = auth.uid()
    and public.staff_may_answer_message(message_id)
    and exists (
      select 1 from public.student_messages m
       where m.id = message_id and (m.status = 'answered' or m.reply_body is not null)
    )
  );

drop policy if exists "super admin manages student message replies" on public.student_message_replies;
create policy "super admin manages student message replies" on public.student_message_replies
  for all using (public.app_current_role() = 'super_admin');

notify pgrst, 'reload schema';
