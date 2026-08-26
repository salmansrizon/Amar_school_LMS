-- 0148_student_messages.sql
-- Map #434 / ticket #454: a Student asks their Class Teacher a question.
--
-- Shape settled while charting: ONE question, ONE reply. Not threaded, and
-- deliberately so — a thread between an adult and a child is a chat channel,
-- and this product does not have one. It mirrors feedback_messages, which has
-- shipped and works.

create table if not exists public.student_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,

  -- Both anchors nullable, at least one required. A question is either about a
  -- specific post (a task, a notice, a lesson plan) or about a subject in
  -- general; a question anchored to neither is the unstructured chat this
  -- feature exists to avoid, and the teacher's inbox has nowhere to file it.
  publication_id uuid references public.publications (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,

  subject text not null,
  body text not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'answered')),

  reply_body text,
  replied_by uuid references public.profiles (id) on delete set null,
  replied_at timestamptz,

  created_at timestamptz not null default now(),

  constraint student_message_has_anchor
    check (publication_id is not null or subject_id is not null)
);

create index if not exists student_messages_school_idx
  on public.student_messages (school_id, status, created_at desc);
create index if not exists student_messages_anchor_idx
  on public.student_messages (publication_id, subject_id);

alter table public.student_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Tenancy, the way every cross-table reference here is guarded.
--
-- student_id, publication_id and subject_id are all client-supplied, so each is
-- re-verified against the row's own school (mirrors enforce_class_ref_school).
create or replace function public.enforce_student_message_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from students where id = new.student_id;
  if v_school is null or v_school <> new.school_id then
    raise exception 'student does not belong to this school';
  end if;

  if new.publication_id is not null then
    select school_id into v_school from publications where id = new.publication_id;
    if v_school is null or v_school <> new.school_id then
      raise exception 'publication does not belong to this school';
    end if;
  end if;

  if new.subject_id is not null then
    select c.school_id into v_school
      from subjects s left join classes c on c.id = s.class_id
     where s.id = new.subject_id;
    -- A school-wide subject has no class and therefore no school of its own;
    -- only a class-bound one can be checked, and a mismatch is refused.
    if v_school is not null and v_school <> new.school_id then
      raise exception 'subject does not belong to this school';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists student_message_refs on public.student_messages;
create trigger student_message_refs
  before insert or update on public.student_messages
  for each row execute function public.enforce_student_message_refs();

-- ---------------------------------------------------------------------------
-- Who may do what.
--
-- A Student asks and reads their own. They may NOT update: the reply and the
-- status live on the same row, so an update grant would let a student write the
-- teacher's answer or mark their own question answered.
drop policy if exists "student reads own messages" on public.student_messages;
create policy "student reads own messages" on public.student_messages
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student asks own question" on public.student_messages;
create policy "student asks own question" on public.student_messages
  for insert with check (
    student_id = public.app_current_student_id()
    and school_id = public.app_current_student_school_id()
    and reply_body is null
    and status = 'unread'
  );

-- Staff read and answer every question in their school. Owner oversight is the
-- default by design: there is no unmonitored adult-to-child channel here.
drop policy if exists "school members read messages" on public.student_messages;
create policy "school members read messages" on public.student_messages
  for select using (school_id = public.app_current_school_id());

drop policy if exists "school members answer messages" on public.student_messages;
create policy "school members answer messages" on public.student_messages
  for update using (school_id = public.app_current_school_id())
  with check (school_id = public.app_current_school_id());

drop policy if exists "super admin manages student messages" on public.student_messages;
create policy "super admin manages student messages" on public.student_messages
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- The teacher's inbox, grouped topic-wise.
--
-- Grouping IS the feature, not a nicety, so the grouping key is resolved in the
-- database rather than reassembled per screen: the post a question was asked
-- from, or the subject it was asked about.
drop view if exists public.student_message_inbox;
create view public.student_message_inbox with (security_invoker = on) as
  select m.*,
         s.full_name  as student_name,
         s.class_name,
         s.section,
         s.roll_number,
         p.title      as publication_title,
         p.kind       as publication_kind,
         sub.name     as subject_name,
         coalesce(p.title, sub.name, '—') as topic_label,
         coalesce(m.publication_id::text, m.subject_id::text) as topic_key
    from public.student_messages m
    join public.students s on s.id = m.student_id
    left join public.publications p on p.id = m.publication_id
    left join public.subjects sub on sub.id = m.subject_id;

grant select on public.student_message_inbox to authenticated;

-- ---------------------------------------------------------------------------
-- Who to notify, as two definer scalars.
--
-- Both answer a question about SOMEBODY ELSE's login id, which is exactly what
-- neither party may read from `profiles`: a Student sees only their own row,
-- and a teacher must not be able to enumerate students' logins. Returning one
-- uuid to the server action keeps both tables shut.
create or replace function public.class_teacher_profile_for(
  p_school uuid, p_class text, p_section text
) returns uuid
language sql stable security definer set search_path = public as $$
  select e.profile_id
    from classes c
    join employees e on e.id = c.class_teacher_id
   where c.school_id = p_school
     and c.name = p_class
     and coalesce(c.section, '') = coalesce(p_section, '')
   limit 1
$$;

create or replace function public.student_profile_for(p_student uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.profile_id from students s
   where s.id = p_student
     and s.school_id = public.app_current_school_id()
$$;

revoke execute on function public.class_teacher_profile_for(uuid, text, text) from anon;
grant execute on function public.class_teacher_profile_for(uuid, text, text) to authenticated;
revoke execute on function public.student_profile_for(uuid) from anon;
grant execute on function public.student_profile_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The subject picker for a general question.
--
-- The anchor needs a subject id, but a Student has no policy on `subjects` —
-- their routine and materials arrive pre-resolved by name. One definer view of
-- just id and name, for the subjects taught to their own class.
drop view if exists public.student_subject_option;
create view public.student_subject_option with (security_invoker = off, security_barrier = true) as
  select distinct s.id, s.name
    from public.subjects s
    join public.classes c on c.id = s.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '');

grant select on public.student_subject_option to authenticated;
