-- 0131_student_foundation.sql
-- Map #434 / ticket #441: the Student becomes a real actor.
--
-- Additive only. Staging and main share one Supabase project, so nothing here
-- drops or renames anything main uses. The one redefinition (app_current_school_id)
-- narrows a helper's meaning for a role that did not exist until 0130.

-- ---------------------------------------------------------------------------
-- 1. The single leak point, closed once.
--
-- Every school-scoped policy in this database is written
--   using (school_id = public.app_current_school_id())
-- and every one of them means "the caller is a member of this school's staff".
-- A Student's profile carries school_id too, so without this change the first
-- student login would have inherited read AND write on students, employees,
-- fees, behaviour logs and every other tenant table — ~200 policies, one cause.
--
-- Narrowing the helper fixes all of them at the seam instead of auditing each.
-- Student-side policies resolve their school through app_current_student_id()
-- below. Nothing regresses: no role that existed before 0130 changes meaning.
create or replace function public.app_current_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid() and role <> 'student'
$$;

-- School-scoped roles must have a school. 'student' joins school_owner and
-- staff_user on that side of the constraint.
alter table public.profiles drop constraint if exists school_scoping;
alter table public.profiles add constraint school_scoping check
  ((role in ('school_owner', 'staff_user', 'student')) = (school_id is not null));

-- ---------------------------------------------------------------------------
-- 2. Student identity: the login link and the Student Number (#436).
alter table public.students
  add column if not exists profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists student_no text;

-- Nullable: a Student exists from admission and gets a login later, or never.
-- Unique: one login is exactly one Student.
create unique index if not exists students_profile_unique
  on public.students (profile_id) where profile_id is not null;

alter table public.students drop constraint if exists students_student_no_format;
alter table public.students add constraint students_student_no_format
  check (student_no is null or student_no ~ '^[A-Za-z0-9._-]{1,32}$');

create unique index if not exists students_student_no_unique
  on public.students (school_id, student_no) where student_no is not null;

-- Backfill every existing Student, sequential per school by admission order, so
-- no Student is ever without a number and no "assign numbers" chore exists.
with numbered as (
  select id,
         'S' || lpad(row_number() over (partition by school_id order by created_at, id)::text, 4, '0') as no
    from public.students
   where student_no is null
)
update public.students s set student_no = n.no
  from numbered n where n.id = s.id;

-- Auto-assign at admission, overridable by an explicit value on the form —
-- the same shape assign_student_roll already has. The advisory lock copies
-- 0034's roll hardening: max()+1 is not atomic, and the unique index above only
-- turns a race into a visible error rather than preventing it.
create or replace function public.assign_student_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare next_n int;
begin
  if new.student_no is null then
    perform pg_advisory_xact_lock(hashtextextended(new.school_id::text || ':student_no', 0));
    select coalesce(max(substring(student_no from 2)::int), 0) + 1 into next_n
      from students
     where school_id = new.school_id and student_no ~ '^S[0-9]+$';
    new.student_no := 'S' || lpad(next_n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists student_assign_no on public.students;
create trigger student_assign_no
  before insert on public.students
  for each row execute function public.assign_student_no();

-- Immutable after insert: the Student Number is half of their login address.
-- Promotion (transfer_student) rewrites roll_number; it must never touch this.
create or replace function public.enforce_student_no_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.student_no is not null and new.student_no is distinct from old.student_no then
    raise exception 'student_no is immutable';
  end if;
  return new;
end $$;

drop trigger if exists student_no_immutable on public.students;
create trigger student_no_immutable
  before update on public.students
  for each row execute function public.enforce_student_no_immutable();

-- ---------------------------------------------------------------------------
-- 3. The one student-side helper (#438).
--
-- Archived Students resolve to null here, which is what disables their login:
-- every student policy denies, and the portal shows "account inactive". Nothing
-- else is needed — my_class / my_section are columns on the row this returns.
create or replace function public.app_current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where profile_id = auth.uid() and archived_at is null
$$;

-- ---------------------------------------------------------------------------
-- 4. Own profile: a view, not a policy.
--
-- RLS cannot scope to columns, so an own-row SELECT policy on students would
-- hand a Student guardian_nid, sibling_info and the admission internals over
-- the REST API no matter what the UI selects. Students therefore get NO policy
-- on students at all; the safe columns are the ones present in this view, and
-- the unsafe ones are absent rather than merely unselected.
--
-- security_invoker = off (the default, stated explicitly because it is the
-- whole mechanism): the view runs as its owner and so reads past students RLS,
-- with the auth.uid() predicate below as the only row filter.
--
-- Archived Students are filtered out here rather than in each policy, so
-- "archived means locked out" holds for every policy written on this map
-- without any of them having to remember it.
drop view if exists public.student_self;
create view public.student_self with (security_invoker = off) as
  select id, school_id, student_no, full_name, roll_number, class_name, section,
         gender, date_of_birth, blood_group, religion, student_mobile,
         village, union_name, upazila, district,
         guardian_name, guardian_relation, guardian_mobile, guardian_phone,
         photo_path, created_at
    from public.students
   where profile_id = auth.uid() and archived_at is null;

grant select on public.student_self to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The two tables the shell itself needs.
-- Everything else (publications, routines, exams, fees, attendance …) is added
-- by the ticket that surfaces it, so a table is never open before a screen reads it.
--
-- Policies scope through student_self, not through `students`. A policy body is
-- evaluated with the CALLER's privileges, and a Student has no policy on
-- `students` — so a subquery against the base table reads zero rows and every
-- such policy silently denies. The definer view is the one window that works,
-- and it carries the archived filter for free.
drop policy if exists "student reads own school" on public.schools;
create policy "student reads own school" on public.schools
  for select using (id = (select school_id from public.student_self));

drop policy if exists "student reads own class" on public.classes;
create policy "student reads own class" on public.classes
  for select using (
    exists (
      select 1 from public.student_self me
       where me.school_id = classes.school_id
         and me.class_name = classes.name
         and coalesce(me.section, '') = coalesce(classes.section, '')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Policy-engine role + app-group permission (mirrors 0109's agent).
insert into public.roles (key, label)
  values ('student', '{"bn":"শিক্ষার্থী","en":"Student"}')
  on conflict (key) do nothing;
insert into public.permissions (key, description)
  values ('student.access', 'Access the Student portal')
  on conflict (key) do nothing;
insert into public.role_permissions (role_key, permission_key)
  values ('student', 'student.access')
  on conflict (role_key, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Reserve the new route group's name as a subdomain (0109 last recreated this).
create or replace function public.is_valid_subdomain(slug text) returns boolean
language sql immutable set search_path = public as $$
  select slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     and slug !~ '--'
     and char_length(slug) between 3 and 63
     and slug <> all (array[
       'admin','agent','api','app','assets','auth','blog','cdn','dealer','distributor','dev','docs',
       'gov','help','login','mail','preview','reset-password','school','signup',
       'staging','static','status','student','students','super-admin','support','vercel','www'
     ])
$$;
