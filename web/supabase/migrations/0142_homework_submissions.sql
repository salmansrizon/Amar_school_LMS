-- 0142_homework_submissions.sql
-- Map #434 / ticket #448: a Student uploads work against a task; the Class
-- Teacher reviews it.
--
-- The ticket names two defects earlier tickets learned the hard way, and both
-- are designed out here rather than rediscovered:
--   1. Caps enforced by a row-locking trigger, not by app-layer counting — a
--      plain count leaves a race open between two concurrent uploads (the same
--      shape as the roll-number race of 0034).
--   2. The bucket's own file_size_limit and the app's cap are the SAME number,
--      declared once below. A mismatch between the two was a real review defect
--      on the publishing ticket.

-- ---------------------------------------------------------------------------
-- 1. Limits, declared once.
--
-- 5 MiB matches the bucket ceiling exactly; 5 files per task is generous for a
-- photographed exercise book and small enough to bound a school's storage.
create or replace function public.submission_max_bytes() returns bigint
  language sql immutable as $$ select 5242880::bigint $$;
create or replace function public.submission_max_files() returns int
  language sql immutable as $$ select 5 $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. The submission.
--
-- Resubmission REPLACES rather than versioning. A student re-photographing a
-- page because the first was blurred is correcting an upload, not producing a
-- second draft, and a teacher opening a task wants the work — not an archive to
-- pick through. The submitted_at timestamp moves with it, so lateness is judged
-- on what the teacher actually reads.
create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  publication_id uuid not null references public.publications (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null check (file_size > 0),
  note text,
  submitted_at timestamptz not null default now(),
  -- Teacher review. Deliberately nullable: reviewing is optional, and an
  -- unreviewed submission is a normal state, not a broken one.
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  teacher_comment text,
  marks numeric(6, 2)
);

create index if not exists homework_submissions_task_idx
  on public.homework_submissions (publication_id, student_id);

alter table public.homework_submissions enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Caps + tenancy, in one row-locking trigger.
--
-- publication_id and student_id are client-supplied, so this re-verifies both
-- belong to the same school as the row (mirrors enforce_class_ref_school), and
-- counts existing files under a lock on the parent publication so two
-- simultaneous uploads cannot both see "4 of 5" and both insert.
create or replace function public.enforce_submission_caps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  task_school uuid;
  student_school uuid;
  existing int;
begin
  select school_id into task_school from publications
   where id = new.publication_id for update;
  if not found or task_school <> new.school_id then
    raise exception 'task does not belong to this school';
  end if;

  select school_id into student_school from students where id = new.student_id;
  if not found or student_school <> new.school_id then
    raise exception 'student does not belong to this school';
  end if;

  if new.file_size > public.submission_max_bytes() then
    raise exception 'file exceeds the % byte submission limit', public.submission_max_bytes();
  end if;

  select count(*) into existing from homework_submissions
   where publication_id = new.publication_id and student_id = new.student_id;
  if existing >= public.submission_max_files() then
    raise exception 'this task already has its maximum of % files', public.submission_max_files();
  end if;

  return new;
end $$;

drop trigger if exists homework_submission_caps on public.homework_submissions;
create trigger homework_submission_caps
  before insert on public.homework_submissions
  for each row execute function public.enforce_submission_caps();

-- ---------------------------------------------------------------------------
-- 4. Who may do what.
--
-- A Student owns their own submission — insert, read, and delete it to replace
-- it. They may NOT update: the review columns live on the same row, and an
-- UPDATE grant would let a student write their own marks. Replacing means
-- delete-then-insert, which also keeps the orphan cleanup below honest.
drop policy if exists "student reads own submissions" on public.homework_submissions;
create policy "student reads own submissions" on public.homework_submissions
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student submits own work" on public.homework_submissions;
create policy "student submits own work" on public.homework_submissions
  for insert with check (student_id = public.app_current_student_id());

drop policy if exists "student withdraws own submission" on public.homework_submissions;
create policy "student withdraws own submission" on public.homework_submissions
  for delete using (student_id = public.app_current_student_id() and reviewed_at is null);

-- Staff read every submission in their school and may review it.
drop policy if exists "school members read submissions" on public.homework_submissions;
create policy "school members read submissions" on public.homework_submissions
  for select using (school_id = public.app_current_school_id());

drop policy if exists "school members review submissions" on public.homework_submissions;
create policy "school members review submissions" on public.homework_submissions
  for update using (school_id = public.app_current_school_id())
  with check (school_id = public.app_current_school_id());

drop policy if exists "super admin manages submissions" on public.homework_submissions;
create policy "super admin manages submissions" on public.homework_submissions
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 5. Storage, and orphan cleanup up front.
--
-- The upload is client-direct, so the object can land before the row does — and
-- if the insert then fails a cap check, the object is orphaned. The publishing
-- ticket had to retrofit exactly this. Here the object is deleted with its row,
-- and a Student may only write inside their own folder, so an orphan is always
-- reachable and always theirs.
create policy "student reads own submission objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
    and (storage.foldername(name))[2] = public.app_current_student_id()::text
  );
create policy "student writes own submission objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
    and (storage.foldername(name))[2] = public.app_current_student_id()::text
  );
create policy "student deletes own submission objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
    and (storage.foldername(name))[2] = public.app_current_student_id()::text
  );
create policy "school members read submission objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );

-- Deleting the row deletes the object. Storage rows are ordinary table rows, so
-- this is a plain FK-less cleanup trigger rather than a scheduled sweep.
create or replace function public.drop_submission_object() returns trigger
language plpgsql security definer set search_path = public, storage as $$
begin
  delete from storage.objects where bucket_id = 'submissions' and name = old.storage_path;
  return old;
end $$;

drop trigger if exists homework_submission_object_cleanup on public.homework_submissions;
create trigger homework_submission_object_cleanup
  after delete on public.homework_submissions
  for each row execute function public.drop_submission_object();
