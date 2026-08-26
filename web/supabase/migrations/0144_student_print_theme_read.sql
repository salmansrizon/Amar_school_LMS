-- 0144_student_print_theme_read.sql
-- Map #434 / ticket #449 follow-on.
--
-- Every printable a Student can produce renders the school's own header, and
-- the admit card (#450) additionally resolves the school's saved palette.
-- Both school_print_themes and the school-logos bucket key on
-- app_current_school_id(), which is null for a Student since 0131 — so without
-- this the student's copy comes out unbranded while the office's copy is
-- branded, and the two documents stop looking like the same school's.
--
-- (Mark sheets pick a layout from ?template=1|2|3 and use no palette; themes
-- are an admit-card concept.)
--
-- It is a palette key. No personal data, read only.
drop policy if exists "student reads own school print themes" on public.school_print_themes;
create policy "student reads own school print themes" on public.school_print_themes
  for select using (school_id = public.app_current_student_school_id());

-- Same for the logo object the header renders.
drop policy if exists "student reads own school logo objects" on storage.objects;
create policy "student reads own school logo objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
  );
