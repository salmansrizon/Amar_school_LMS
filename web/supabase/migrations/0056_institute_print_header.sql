-- Print chrome foundation (issue #92, map #91, docs/improvement.md "General
-- Printing Requirements"): every printable needs one professional institution
-- header. `schools` already carries the registration codes (0043) but no
-- postal address, contact details or logo.
--
-- Address is deliberately free text (map #91 grilling decision 5) — NOT
-- composed from the locations hierarchy, which only reaches union level and
-- has no street line. What the owner types is what prints.

alter table public.schools
  add column address_line text,
  add column mobile text,
  add column email text,
  add column logo_path text;

-- Private bucket for the school logo, one object per school under its own
-- folder (`{school_id}/logo.{ext}`), same shape as syllabus/gallery/
-- student-photos. Small ceiling: this is a header mark, not a photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos', 'school-logos', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "school members read own logo objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school owners write own logo objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
    and public.app_current_role() = 'school_owner'
  );
create policy "school owners update own logo objects" on storage.objects
  for update to authenticated using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
    and public.app_current_role() = 'school_owner'
  );
create policy "school owners delete own logo objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
    and public.app_current_role() = 'school_owner'
  );
create policy "super admin manages logo objects" on storage.objects
  for all to authenticated using (
    bucket_id = 'school-logos' and public.app_current_role() = 'super_admin'
  );
