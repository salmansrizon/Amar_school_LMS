-- 0262_employee_photo.sql
-- Employee profile photo: a column to point at it and a private bucket to hold it.
--
-- WHAT
--   1. employees.photo_path   text, nullable. The storage path of the
--                             employee's photo, or NULL when there is none.
--   2. bucket employee-photos private, images only (JPEG / PNG / WebP), 2 MB
--                             cap — the same definition as student-photos (0032).
--   3. five policies on storage.objects for that bucket, the same five 0032
--      created for student-photos, with only the bucket id changed.
--
-- WHY
--   Owner's decision 2026-10-09: "Students now, employee photos as a new
--   feature". Students have had a photo since 0032; employees had no column,
--   no bucket and no upload. The employee list, archive, drawer and profile
--   show the photo once this is applied.
--
-- EFFECT ON EXISTING DATA
--   None. The column is added NULL for every employee; no row is rewritten, no
--   existing object or policy is touched. Views over `employees` keep their
--   column lists (a view does not pick up a new table column).
--
-- WHO CAN DO WHAT (objects in employee-photos)
--   School Owner ............ read, upload, replace and delete, inside the
--                             folder of their own School only.
--   Office staff (Staff User) the same four at the storage level — this is the
--                             student-photos precedent ("school members"), not
--                             widened and not narrowed. In the app they also
--                             need the `employees` row: RLS on public.employees
--                             requires the Employees module grant (0136), so a
--                             Staff User without it gets no upload ticket, no
--                             picture URL and cannot set photo_path.
--   Teacher / staff who is    exactly a Staff User (above) when they have a
--   also an employee row      login; there is no "own photo only" rule, as there
--                             is none for students. An employee with no login
--                             can do nothing.
--   Student ................. nothing. app_current_school_id() is NULL for the
--                             'student' role (0131), so no policy below matches,
--                             and the student-side policies that exist for
--                             student-photos (0149) are deliberately NOT
--                             mirrored here.
--   anon .................... nothing. Every policy is `to authenticated` and
--                             the bucket is private. The anon ID-card policy
--                             student-photos has (0065) is NOT mirrored.
--   Super Admin ............. everything in the bucket (as for student-photos).
--
-- WHY A PATH CANNOT CROSS SCHOOLS
--   The app builds the path on the server as  {school_id}/{employee_id}.{ext}
--   (lib/photos.ts photoObjectPath): school_id from the caller's own profile,
--   employee_id checked against a row the caller can read, ext from the MIME
--   type — nothing from the file name or the browser. Independently of the
--   app, each policy requires
--       (storage.foldername(name))[1] = public.app_current_school_id()::text
--   so a caller from School B naming a path under School A's folder matches no
--   policy for read, insert, update or delete. The UPDATE policy has no
--   separate WITH CHECK, so Postgres applies its USING clause to the new row
--   too: an object cannot be renamed into another School's folder.
--
-- PRE-CHECK (read-only)
--   select count(*) from storage.buckets where id = 'employee-photos';
--   -- expect 0
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'employees' and column_name = 'photo_path';
--   -- expect 0
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname in (
--        'school members read own student photos',
--        'school members write own student photos',
--        'school members update own student photos',
--        'school members delete own student photos',
--        'super admin manages student photos')
--    order by policyname;
--   -- expect 5 rows (the policies this migration mirrors)
--   select count(*) from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and policyname like '%employee photos';
--   -- expect 0
--
-- ROLLBACK (in this order)
--   1. Empty the bucket through the Storage API or the dashboard (Storage >
--      employee-photos > select all > delete). `delete from storage.objects`
--      is refused by the platform (see 0157).
--   2. drop policy if exists "school members read own employee photos" on storage.objects;
--      drop policy if exists "school members write own employee photos" on storage.objects;
--      drop policy if exists "school members update own employee photos" on storage.objects;
--      drop policy if exists "school members delete own employee photos" on storage.objects;
--      drop policy if exists "super admin manages employee photos" on storage.objects;
--   3. Delete the (now empty) bucket in the dashboard, or
--      delete from storage.buckets where id = 'employee-photos';
--   4. alter table public.employees drop column if exists photo_path;
--   5. notify pgrst, 'reload schema';
--   The app works at every step: without the column it hides the upload
--   control and shows letter tiles.
--
-- Idempotent: safe to paste twice.

alter table public.employees add column if not exists photo_path text;

-- Employee photo bucket (private, images only, 2 MB cap) — as student-photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "school members read own employee photos" on storage.objects;
create policy "school members read own employee photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );

drop policy if exists "school members write own employee photos" on storage.objects;
create policy "school members write own employee photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );

drop policy if exists "school members update own employee photos" on storage.objects;
create policy "school members update own employee photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );

drop policy if exists "school members delete own employee photos" on storage.objects;
create policy "school members delete own employee photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );

drop policy if exists "super admin manages employee photos" on storage.objects;
create policy "super admin manages employee photos" on storage.objects
  for all to authenticated using (
    bucket_id = 'employee-photos' and public.app_current_role() = 'super_admin'
  );

notify pgrst, 'reload schema';
