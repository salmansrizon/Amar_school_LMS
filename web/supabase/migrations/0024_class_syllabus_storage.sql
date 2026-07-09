-- Per-class syllabus PDF upload/replace (issue #45, PRD §5.4). Files live in a
-- private Storage bucket; a metadata row per class records the current file.
-- Additive only. First use of Supabase Storage in this app.

-- Private bucket, PDF-only, 10 MB cap (server-enforced by Storage).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabus', 'syllabus', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- One syllabus per class. storage_path is `{school_id}/{class_id}.pdf`.
create table public.class_syllabi (
  class_id uuid primary key references public.classes (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);
alter table public.class_syllabi enable row level security;
create policy "school members manage class_syllabi" on public.class_syllabi
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages class_syllabi" on public.class_syllabi
  for all using (public.app_current_role() = 'super_admin');

-- Storage RLS: a School member may read/write objects only inside their own
-- School's folder (first path segment = their school_id). Super Admin is granted
-- platform-wide for vendor-side maintenance.
create policy "school members read own syllabus objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members write own syllabus objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members update own syllabus objects" on storage.objects
  for update to authenticated using (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members delete own syllabus objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "super admin manages syllabus objects" on storage.objects
  for all to authenticated using (
    bucket_id = 'syllabus' and public.app_current_role() = 'super_admin'
  );
