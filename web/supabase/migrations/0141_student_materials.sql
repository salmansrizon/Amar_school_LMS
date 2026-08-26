-- 0141_student_materials.sql
-- Map #434 / ticket #447: study material, from two sources, on one surface.
--
-- A Student does not care that a syllabus lives in class_syllabi and a lesson
-- plan lives in publications. They care what the material is, which subject it
-- belongs to, and how to open it. So the seam is one definer view that unions
-- both — the same shape student_routine takes, and for the same reason: the
-- rows are only ever wanted fully resolved, so resolving them behind one
-- interface means a Student needs no grant on the underlying tables.

drop view if exists public.student_material;
create view public.student_material with (security_invoker = off, security_barrier = true) as
  -- Lesson plans, daily lessons and exam prep: publications, already targeted.
  select p.id,
         'publication'::text as source,
         p.kind,
         p.title,
         p.content,
         p.image_path                as storage_path,
         null::text                  as file_name,
         p.link_url,
         p.created_at                as posted_at,
         author.full_name            as posted_by
    from public.publications p
    left join public.profiles author on author.id = p.created_by
   where p.kind in ('lesson_plan', 'daily_lesson', 'exam_prep')
     and p.school_id = public.app_current_student_school_id()
     and (p.target_type = 'all'
          or public.student_matches_target(p.school_id, p.target_class_name, p.target_section))

  union all

  -- The class syllabus PDF. One per class (class_id is its primary key), so the
  -- class id doubles as the row id — there is nothing else to key it by.
  select cs.class_id                 as id,
         'syllabus'::text            as source,
         'syllabus'::text            as kind,
         cs.file_name                as title,
         null::text                  as content,
         cs.storage_path,
         cs.file_name,
         null::text                  as link_url,
         cs.uploaded_at              as posted_at,
         -- class_syllabi records no uploader; showing a name we do not have
         -- would be worse than showing none.
         null::text                  as posted_by
    from public.class_syllabi cs
    join public.classes c on c.id = cs.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '');

grant select on public.student_material to authenticated;

-- Storage: the syllabus bucket keys on app_current_school_id(), null for a
-- Student since 0131. Their own school's folder, read only — the publications
-- bucket already got the same treatment in 0139.
drop policy if exists "student reads own school syllabus objects" on storage.objects;
create policy "student reads own school syllabus objects" on storage.objects
  for select using (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_student_school_id()::text
  );
