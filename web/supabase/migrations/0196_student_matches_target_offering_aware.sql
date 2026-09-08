-- 0196_student_matches_target_offering_aware.sql
-- Issue #595, map #598 Wave 2 (#603) -- student_matches_target() backs the
-- Student-facing RLS SELECT policy on publications: the actual authorization
-- boundary deciding which Notices/Homework/Lesson-plans a Student may read,
-- not a display helper. Moves it onto the shared resolution primitive
-- (publication_target_matches_offering, migration 0195) instead of its own
-- (school, name, section)-text match -- the same #593-class ambiguity fix,
-- applied to the last consumer that still needs it for this table.
--
-- Signature change: (p_school uuid, p_class text, p_section text) --
-- resolving "which Offering" from raw text -- becomes nine parameters, the
-- publication row's OWN target columns (target_scope, target_type,
-- school_id, class_offering_id, target_class_name, target_academic_year,
-- target_shift, target_group_department, target_section), matching the old
-- function's own calling convention (pass the row's columns, not an id the
-- function would have to self-select back out of the very table its policy
-- gates) just extended for the new columns. Still takes no Student
-- parameter -- resolves the CALLING Student via auth.uid() internally,
-- exactly like the function it replaces -- there is no legitimate caller
-- who needs to ask about a different Student (same reasoning as
-- class_teacher_profile_for, 0189).
--
-- CORRECTED during code review, before every caller was updated: the first
-- draft joined students -> student_enrollments -> class_offerings via INNER
-- JOIN and checked co.school_id = p_school. Every prior version of the
-- RLS policy/student_material wrapped their own call in `target_type = 'all'
-- OR student_matches_target(...)` specifically so an unenrolled Student
-- (current_enrollment_id null) still received school-wide publications --
-- 0188's own comment states this explicitly as a preserved guarantee. This
-- migration is the first to fold the 'all' case INTO the function itself
-- (matching the new shared predicate's own design), but an INNER JOIN
-- produces zero candidate rows for an unenrolled Student before the
-- predicate is ever evaluated, silently breaking that guarantee for every
-- scope including 'all' -- a real regression, caught by code review, not by
-- inspection. Fixed to LEFT JOIN (matching task_completion_roster's own,
-- already-correct pattern, 0197) and to check me.school_id directly rather
-- than co.school_id, since an unenrolled Student has no Offering to check
-- against at all -- students.school_id is always present regardless of
-- Enrollment status, and matches co.school_id by construction for an
-- enrolled Student anyway (enforce_student_enrollment_school, 0180).
-- The legacy (target_scope is null) fallback below and task_completion_
-- roster's OWN inline predicate (0188) were about to become two independent
-- hand-copies of the identical (name, section)-text rule -- caught by code
-- review as the exact "silently diverge" failure mode this whole map exists
-- to close, recurring inside its own transitional scaffolding rather than
-- the steady-state code 0195's shared predicate already protects. Extracted
-- once here instead; task_completion_roster is repointed at it below too
-- (a pure de-duplication -- it does not yet gain class_offering_id/Shift/
-- Group Department awareness, since giving it that is Wave 3's own job,
-- #604, not this one).
create function public.publication_target_matches_offering_legacy(
  p_target_type text,
  p_target_class_name text,
  p_target_section text,
  p_offering_name text,
  p_offering_section text
) returns boolean
language sql immutable as $$
  select p_target_type = 'all'
    or (
      (p_target_class_name is null or p_offering_name = p_target_class_name)
      and (p_target_section is null or coalesce(p_offering_section, '') = p_target_section)
    )
$$;

revoke execute on function public.publication_target_matches_offering_legacy(
  text, text, text, text, text
) from anon, public;
grant execute on function public.publication_target_matches_offering_legacy(
  text, text, text, text, text
) to authenticated;

comment on function public.publication_target_matches_offering_legacy(
  text, text, text, text, text
) is
  'The pre-#595 (name, section)-text targeting rule, extracted (map #598 '
  'Wave 2/#603) so student_matches_target''s target_scope-is-null fallback '
  'and task_completion_roster (0188) share one copy instead of two '
  'independently hand-maintained ones during the transitional window. '
  'Retired in Wave 7 (#608) once every row has target_scope populated and '
  'nothing calls this anymore.';

-- The dual-path dispatch itself (target_scope populated -> shared predicate;
-- still null -> legacy predicate) is needed by every consumer during the
-- transitional window, not just this one -- caught by code review as about
-- to become a second hand-copy of the SAME dispatch logic once
-- task_completion_roster (Wave 3, #604) needed it too, one level up from
-- the exact duplication publication_target_matches_offering_legacy was just
-- extracted to prevent. Extracted once here so every transitional-window
-- consumer (this function, task_completion_roster) shares the one dispatch,
-- not a hand-copy each -- when Wave 7 (#608) removes the fallback, there is
-- exactly one place to simplify, not N.
create function public.publication_target_matches_offering_any(
  p_target_scope text,
  p_target_type text,
  p_class_offering_id uuid,
  p_target_class_name text,
  p_target_academic_year int,
  p_target_shift text,
  p_target_group_department text,
  p_target_section text,
  p_offering_id uuid,
  p_offering_name text,
  p_offering_academic_year int,
  p_offering_shift text,
  p_offering_group_department text,
  p_offering_section text
) returns boolean
language sql immutable as $$
  select case
    when p_target_scope is not null then public.publication_target_matches_offering(
      p_target_scope, p_class_offering_id, p_target_class_name, p_target_academic_year,
      p_target_shift, p_target_group_department, p_target_section,
      p_offering_id, p_offering_name, p_offering_academic_year,
      p_offering_shift, p_offering_group_department, p_offering_section
    )
    else public.publication_target_matches_offering_legacy(
      p_target_type, p_target_class_name, p_target_section, p_offering_name, p_offering_section
    )
  end
$$;

revoke execute on function public.publication_target_matches_offering_any(
  text, text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) from anon, public;
grant execute on function public.publication_target_matches_offering_any(
  text, text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) to authenticated;

comment on function public.publication_target_matches_offering_any(
  text, text, uuid, text, int, text, text, text, uuid, text, int, text, text, text
) is
  'The transitional-window dispatch (map #598 Wave 2/#603): delegates to '
  'publication_target_matches_offering when target_scope is populated, '
  'falls back to publication_target_matches_offering_legacy when it is '
  'still null. Shared by student_matches_target and task_completion_roster '
  '(Wave 3/#604) rather than each hand-copying the same if/else -- retired '
  'in Wave 7 (#608), at which point every caller collapses back onto '
  'publication_target_matches_offering directly.';

create function public.student_matches_target(
  p_target_scope text,
  p_target_type text,
  p_school uuid,
  p_class_offering_id uuid,
  p_target_class_name text,
  p_target_academic_year int,
  p_target_shift text,
  p_target_group_department text,
  p_target_section text
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from students me
    left join student_enrollments se on se.id = me.current_enrollment_id
    left join class_offerings co on co.id = se.class_offering_id
    where me.profile_id = auth.uid()
      and me.archived_at is null
      and me.school_id = p_school
      and public.publication_target_matches_offering_any(
        p_target_scope, p_target_type, p_class_offering_id, p_target_class_name, p_target_academic_year,
        p_target_shift, p_target_group_department, p_target_section,
        co.id, co.name, co.academic_year, co.shift, co.group_department, co.section
      )
  )
$$;

revoke execute on function public.student_matches_target(
  text, text, uuid, uuid, text, int, text, text, text
) from anon, public;
grant execute on function public.student_matches_target(
  text, text, uuid, uuid, text, int, text, text, text
) to authenticated;

comment on function public.student_matches_target(
  text, text, uuid, uuid, text, int, text, text, text
) is
  'Whether the calling Student (auth.uid()) currently matches a publication''s '
  'target (issue #595, map #598 Wave 2/#603) -- resolved via their CURRENT '
  'Enrollment''s Class Offering, delegating to the shared '
  'publication_target_matches_offering predicate when the row''s target_scope '
  'is populated, falling back to the legacy target_type/text match for a '
  'not-yet-migrated row (target_scope still null -- removed in Wave 7/#608). '
  'Takes the publication row''s own target columns as parameters, never an '
  'arbitrary Student id -- only ever answers for whoever is authenticated '
  'right now.';

-- ---------------------------------------------------------------------------
-- Both live callers of the old signature, updated. (Verified by grep, not
-- assumed, per #593's own lesson -- exactly two exist: this policy and
-- student_material's publications branch below.)
--
-- `target_type = 'all' or target_scope = 'all' or student_matches_target(...)`,
-- not a bare unconditional call -- caught by code review: the version this
-- replaces (0139/0192) short-circuited the function entirely for the (very
-- likely majority, in any real School) 'all'-scope rows; folding that case
-- INTO student_matches_target (a stable security definer function, which
-- Postgres cannot inline into the calling policy/view) means every row pays
-- for a full subquery -- SECURITY DEFINER context switch plus a three-table
-- join chain -- even school-wide notices that need none of it. This
-- codebase already hit exactly this class of regression once before and
-- fixed it (0166, gl_lines: a per-row function call caused a real 15s
-- timeout) -- restoring the cheap outer check here avoids repeating it.
drop policy if exists "student reads targeted publications" on public.publications;
create policy "student reads targeted publications" on public.publications
  for select using (
    school_id = public.app_current_student_school_id()
    and (
      target_type = 'all'
      or target_scope = 'all'
      or public.student_matches_target(
        target_scope, target_type, school_id, class_offering_id, target_class_name,
        target_academic_year, target_shift, target_group_department, target_section
      )
    )
  );

-- student_material: only its publications branch calls student_matches_target
-- (the syllabus branch already resolves via Enrollment directly, since 0192).
-- Same short-circuit restored as above, same reason.
-- security_invoker=off, security_barrier=true reapplied explicitly -- omitting
-- either on a CREATE OR REPLACE VIEW silently resets it to the default, which
-- is exactly what caused a real cross-tenant leak on task_completion_roster
-- earlier in this same map's work (Wave 4a, #587). Never omit them here.
create or replace view public.student_material
  with (security_invoker = off, security_barrier = true) as
  select p.id,
    'publication'::text as source,
    p.kind,
    p.title,
    p.content,
    p.image_path as storage_path,
    null::text as file_name,
    p.link_url,
    p.created_at as posted_at,
    author.full_name as posted_by
   from publications p
     left join profiles author on author.id = p.created_by
  where p.kind = any (array['lesson_plan'::text, 'daily_lesson'::text, 'exam_prep'::text])
    and p.school_id = app_current_student_school_id()
    and (
      p.target_type = 'all'
      or p.target_scope = 'all'
      or public.student_matches_target(
        p.target_scope, p.target_type, p.school_id, p.class_offering_id, p.target_class_name,
        p.target_academic_year, p.target_shift, p.target_group_department, p.target_section
      )
    )
  union all
  select cs.class_id as id,
    'syllabus'::text as source,
    'syllabus'::text as kind,
    cs.file_name as title,
    null::text as content,
    cs.storage_path,
    cs.file_name,
    null::text as link_url,
    cs.uploaded_at as posted_at,
    null::text as posted_by
   from class_syllabi cs
     join class_offerings c on c.id = cs.class_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id;

-- task_completion_roster (0188): a pure de-duplication only -- repointed at
-- the extracted legacy predicate above, same join shape, same behavior.
-- Caught by this ticket's own regression suite (student-tasks.test.ts,
-- issue #587), not by inspection: 0188 already moved this view off
-- students.class_name/section text onto the real current Enrollment
-- (co.name/co.section via student_enrollments/class_offerings) -- an
-- earlier draft of this migration wired the extracted legacy function to
-- students.class_name/section instead, silently reverting 0188's own fix
-- and reintroducing the exact text-bridge bug that migration closed. Fixed
-- to match 0188's real join shape exactly, changing only which expression
-- evaluates the predicate.
--
-- Does NOT gain class_offering_id/Shift/Group Department awareness here --
-- that rewrite (the real fix for this view's own #601-identified drift from
-- student_matches_target, i.e. two independent hand-copies of the same
-- Enrollment-based rule) is Wave 3's job (#604), not this one.
--
-- security_invoker=on reapplied explicitly -- omitting it on a CREATE OR
-- REPLACE VIEW silently resets it to the default, the exact mistake that
-- caused a real cross-tenant leak on this same view earlier in this map's
-- work (Wave 4a, #587). Never omit it here.
create or replace view public.task_completion_roster with (security_invoker = on) as
  select p.id as publication_id,
         s.id as student_id,
         s.full_name,
         se.roll_number,
         co.name as class_name,
         co.section,
         c.completed_at
    from public.publications p
    join public.students s
      on s.school_id = p.school_id
     and s.archived_at is null
    left join public.student_enrollments se on se.id = s.current_enrollment_id
    left join public.class_offerings co on co.id = se.class_offering_id
    left join public.student_task_completions c
      on c.publication_id = p.id and c.student_id = s.id
   where public.publication_target_matches_offering_legacy(
     p.target_type, p.target_class_name, p.target_section, co.name, co.section
   );

grant select on public.task_completion_roster to authenticated;

comment on view public.task_completion_roster is
  'Every Student eligible for one Publication (target_type=''all'' or a '
  'matching CURRENT Enrollment, map #568/#582 Wave 4a Part B, issue #587), '
  'left-joined to their completion row if any. As of map #598 Wave 2 '
  '(#603), the legacy (name, section)-text predicate itself is shared with '
  'student_matches_target''s own fallback path via '
  'publication_target_matches_offering_legacy, rather than an independent '
  'copy -- the #601-identified drift this map exists to close. Does not '
  'yet resolve target_scope=''offering''/''broadcast'' rows -- that is Wave 3''s '
  '(#604) own job.';

-- Only safe to drop now that both dependents above have been repointed at
-- the new nine-argument signature -- Postgres treats a different arg list as
-- a distinct overload, not a replace, so the old signature stays referenced
-- (and undroppable) until every caller is moved off it in the same
-- migration, never left dangling across a deploy boundary.
drop function if exists public.student_matches_target(uuid, text, text);
