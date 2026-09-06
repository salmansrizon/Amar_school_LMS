-- 0188_wave4a_notices_targeting_enrollment.sql
-- Wave 4a Part B (issue #587), item 6: Notices/homework targeting resolves
-- via the Student's CURRENT Enrollment now, not the legacy
-- students.class_name/section text bridge (#569's "no current Enrollment is
-- a valid state" applies here too — a Student with no current Enrollment
-- simply never matches a 'specific' target, same as before: their
-- class_name was usually null too).
--
-- Two decisions this required, both resolved before writing this (map
-- #582's own #587 update):
--
-- A. Per #572's own resolution comment (issue #572, "SMS compose, Notices
--    targeting" paragraph): "target students via Class Offering -> current
--    student_enrollments -> Students, replacing the text-match." This
--    function's stored target_class_name/target_section columns and their
--    meaning are UNCHANGED (the picker/create-form's own move onto
--    classCatalogueOptions() is item 4, already landed) -- only the
--    RESOLUTION changes from matching students.class_name/section directly
--    to matching the Offering the Student's current Enrollment points at.
--    A null target_section still means "every section of that class name"
--    (preserving the create-form's existing "class alone, no section" valid
--    submission, per docs/012 -- this migration does not narrow that; it
--    only fixes WHICH data source decides the match).
-- B. Confirmed with the user (no authoritative decision existed for this
--    specific case anywhere in CONTEXT.md/ADRs/#572's own resolution):
--    target_type='all' is untouched, still keyed on school_id alone, so an
--    unplaced Student (current_enrollment_id null) keeps receiving 'all'
--    notices/homework/lesson-plans exactly as before. Only the 'specific'
--    path below changes.
--
-- student_matches_target's callers (the `publications` RLS policy, and
-- student_material's own publication branch) both call this function
-- directly and need zero changes themselves -- redefining the body is
-- enough, the same "redefine once, inherit everywhere" property Wave 2
-- already relied on for its own capacity-function rewrite.
create or replace function public.student_matches_target(p_school uuid, p_class text, p_section text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from students me
    join student_enrollments se on se.id = me.current_enrollment_id
    join class_offerings co on co.id = se.class_offering_id
    where me.profile_id = auth.uid()
      and me.archived_at is null
      and co.school_id = p_school
      and (p_class is null or co.name = p_class)
      and (p_section is null or coalesce(co.section, '') = p_section)
  )
$function$;

comment on function public.student_matches_target(uuid, text, text) is
  'Whether the calling Student (auth.uid()) currently matches a specific '
  'Notices/homework target -- resolved via their CURRENT Enrollment''s Class '
  'Offering (map #568/#582, Wave 4a Part B, issue #587), not the legacy '
  'students.class_name/section text bridge. A null p_section still means '
  '"every section of that class name" (#572''s resolution), and a null p_class '
  '(a section-only target, e.g. "everyone in section A") is preserved from the '
  'original version -- caught by code review, since a bare `co.name = p_class` '
  'would have silently matched nobody for that valid, create-form-permitted '
  'input. target_type=''all'' never calls this -- it is keyed on school_id '
  'alone and unaffected.';

-- task_completion_roster never called student_matches_target (it must
-- resolve EVERY student, not just auth.uid()) -- it carried its OWN inline
-- copy of the same rule, matching s.class_name/section directly (#587's own
-- Wave 4a planning-pass finding: "four non-equivalent implementations of the
-- same rule"). Left unfixed here, this view and the function above would
-- silently diverge -- the exact correctness bug fixing only one of the two
-- text-bridge copies would introduce. roll_number/class_name/section now
-- also come from the enrollment/Offering, matching item 2's shape for this
-- view too, not just the roster model.
-- `with (security_invoker = on)` is not cosmetic: 0140's ORIGINAL create view
-- set it explicitly (the non-default), and a bare `create or replace view`
-- with no WITH clause silently resets it back to the default (off) --
-- combined with this view's owner (postgres) having bypassrls, that turned
-- into a real cross-tenant leak, caught by this ticket's own
-- student-tasks.test.ts ("another school's owner sees none of the roster")
-- before this migration file was ever committed. Never omit this on a
-- replace of this view.
create or replace view public.task_completion_roster with (security_invoker = on) as
select
  p.id as publication_id,
  s.id as student_id,
  s.full_name,
  se.roll_number,
  co.name as class_name,
  co.section,
  c.completed_at
from publications p
join students s
  on s.school_id = p.school_id
 and s.archived_at is null
left join student_enrollments se on se.id = s.current_enrollment_id
left join class_offerings co on co.id = se.class_offering_id
left join student_task_completions c on c.publication_id = p.id and c.student_id = s.id
where p.target_type = 'all'
   or (
     (p.target_class_name is null or co.name = p.target_class_name)
     and (p.target_section is null or coalesce(co.section, '') = p.target_section)
   );

comment on view public.task_completion_roster is
  'Every Student eligible for one Publication (target_type=''all'' or a '
  'matching CURRENT Enrollment, map #568/#582 Wave 4a Part B, issue #587), '
  'left-joined to their completion row if any. Kept in parity with '
  'student_matches_target()''s own resolution deliberately -- this view '
  'must resolve every Student, not just auth.uid(), so it cannot call that '
  'definer function and carries its own equivalent join instead.';
