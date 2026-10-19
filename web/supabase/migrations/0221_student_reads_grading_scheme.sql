-- 0221_student_reads_grading_scheme.sql — issue #702 (migration index #703, row 1.2).
-- WRITTEN, NOT APPLIED. The app works with and without it.
--
-- What
--   1. public.student_reads_grading_scheme(p_scheme uuid) returns boolean:
--      true when the calling Student has at least one mark in an exam that
--      uses this grading scheme AND whose results are published.
--   2. Two SELECT-only policies, one on grading_schemes and one on
--      grade_bands, that let a Student read exactly those schemes and bands.
--
-- Why
--   A Student login reads zero rows from grading_schemes and grade_bands: their
--   only policies ask for app_current_school_id() and the Exams Permission
--   Grant (0037, 0136), both empty for a Student. The portal needs the scheme
--   to grade a published result, so today the result page shows marks without
--   grade, GPA or pass/fail (lib/student/result-fallback.ts) and the printed
--   mark sheet returns 404.
--
-- Scope of the new read — the same exams student_exam_result (0143) already
--   shows: published, and the Student has a mark in it. A scheme no published
--   exam of theirs uses stays unreadable. Nothing is writable. Staff policies
--   are not touched.
--
-- Why a function and not a subquery in the policy
--   A subquery in a policy runs with the caller's own row level security, and
--   a Student cannot read exams or exam_marks, so it would match nothing.
--
-- Grants: the function keeps its default EXECUTE grant on purpose. It is a
--   policy helper, and 0150 leaves those ungranted-to-nobody for a stated
--   reason: a policy expression runs with the requesting role's privileges, so
--   revoking PUBLIC would turn an anonymous read of grading_schemes from "no
--   rows" into "permission denied for function". It returns false for anyone
--   who is not a Student with such a mark (auth.uid() matches no student row).
--
-- Effect on existing data: none. No row, column or existing policy changes.
--
-- PRE-CHECK (read-only) — how many schemes become readable, and by how many
--   students. Zero rows means no exam is published yet and nothing changes.
--     select gs.school_id, gs.id as scheme_id, gs.name,
--            count(distinct m.student_id) as students_who_can_read_it
--       from grading_schemes gs
--       join exams e on e.grading_scheme_id = gs.id and e.results_published_at is not null
--       join exam_marks m on m.exam_id = e.id
--      group by gs.school_id, gs.id, gs.name
--      order by gs.school_id, gs.name;
--   And confirm no policy of these names exists already:
--     select tablename, policyname from pg_policies
--      where schemaname = 'public' and tablename in ('grading_schemes', 'grade_bands');
--
-- Rollback (policies first: they call the function)
--   drop policy if exists "student reads grading scheme of own published result" on public.grading_schemes;
--   drop policy if exists "student reads grade bands of own published result" on public.grade_bands;
--   drop function if exists public.student_reads_grading_scheme(uuid);
--   notify pgrst, 'reload schema';
--   (The portal goes back to raw marks without grades, as today.)
-- Idempotent.

create or replace function public.student_reads_grading_scheme(p_scheme uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from exams e
      join exam_marks m on m.exam_id = e.id
      join students me on me.id = m.student_id
                      and me.profile_id = auth.uid()
                      and me.archived_at is null
     where e.grading_scheme_id = p_scheme
       and e.results_published_at is not null
  )
$$;

-- The school_id line is the cheap first filter and keeps the words
-- app_current_student in the policy text: 0136's rewrite loop skips policies
-- that carry them, so a replay of 0136 cannot wrap this one in a staff grant.
drop policy if exists "student reads grading scheme of own published result" on public.grading_schemes;
create policy "student reads grading scheme of own published result" on public.grading_schemes
  for select using (
    school_id = (select public.app_current_student_school_id())
    and public.student_reads_grading_scheme(id)
  );

drop policy if exists "student reads grade bands of own published result" on public.grade_bands;
create policy "student reads grade bands of own published result" on public.grade_bands
  for select using (
    school_id = (select public.app_current_student_school_id())
    and public.student_reads_grading_scheme(grading_scheme_id)
  );

notify pgrst, 'reload schema';
