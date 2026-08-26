-- 0139_student_notices.sql
-- Map #434 / ticket #445: the Student's notice feed.
--
-- No new publication model. `publications` already carries kind, importance and
-- the all/specific targeting; the student side is a read model plus RLS.

-- ---------------------------------------------------------------------------
-- 1. Does this publication's target include me?
--
-- Deliberately NOT student_in_class(): that matches a `classes` row exactly, and
-- a notice targeted at "Class Nine" with no section must reach Class Nine A and
-- Class Nine B alike. A null part of the target means "any", not "blank".
--
-- target_shift_id is ignored on purpose. The student-side Shift concept was
-- deleted by 0060 (issue #100) and nothing in the app has written that column
-- since; treating it as a filter would hide notices from everyone.
create or replace function public.student_matches_target(
  p_school uuid, p_class text, p_section text
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students me
     where me.profile_id = auth.uid()
       and me.archived_at is null
       and me.school_id = p_school
       and (p_class is null or me.class_name = p_class)
       and (p_section is null or coalesce(me.section, '') = p_section)
  )
$$;

drop policy if exists "student reads targeted publications" on public.publications;
create policy "student reads targeted publications" on public.publications
  for select using (
    school_id = public.app_current_student_school_id()
    and (
      target_type = 'all'
      or public.student_matches_target(school_id, target_class_name, target_section)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Read receipts.
--
-- One table for EVERY publication kind, not one per feature. #445 asked whether
-- this should be shared with the tasks ticket: it should, because a task IS a
-- publication here (kind='homework'), as are study materials and lesson plans.
-- "Has this student seen this post" is one question asked of one table.
--
-- What it is NOT is task completion (#446). Marking homework done is a claim a
-- Student makes about their work; opening a page is a UI receipt. Same student,
-- same publication, different meanings — so different tables.
create table if not exists public.student_publication_reads (
  student_id uuid not null references public.students (id) on delete cascade,
  publication_id uuid not null references public.publications (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (student_id, publication_id)
);

alter table public.student_publication_reads enable row level security;

-- A Student may record and read their own receipts, and nothing else. There is
-- no update: a receipt is a fact with a timestamp, and re-reading a notice does
-- not un-read it. No delete either — that is what makes "new since last visit"
-- meaningful rather than something a Student can quietly reset.
drop policy if exists "student reads own publication receipts" on public.student_publication_reads;
create policy "student reads own publication receipts" on public.student_publication_reads
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student records own publication receipt" on public.student_publication_reads;
create policy "student records own publication receipt" on public.student_publication_reads
  for insert with check (student_id = public.app_current_student_id());

drop policy if exists "super admin manages publication receipts" on public.student_publication_reads;
create policy "super admin manages publication receipts" on public.student_publication_reads
  for all using (public.app_current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- 3. Notice images.
--
-- The publications bucket is private and its policies key on
-- app_current_school_id(), which is null for a Student since 0131. Their own
-- school's folder, read only.
drop policy if exists "student reads own school publication objects" on storage.objects;
create policy "student reads own school publication objects" on storage.objects
  for select using (
    bucket_id = 'publications'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
  );
