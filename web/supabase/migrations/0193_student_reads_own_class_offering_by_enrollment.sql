-- 0193_student_reads_own_class_offering_by_enrollment.sql
-- Issue #593 -- a fifth consumer, found by a second code-review pass against
-- 0189-0192, not the first: "student reads own class offering" (SELECT
-- policy on class_offerings, originally 0133, renamed by 0174) still gates
-- via `student_in_class(school_id, name, section)` -- the identical text
-- match every other consumer fixed in this ticket already moved off. Since
-- class_offerings carries the standard authenticated SELECT grant (RLS is
-- the only real gate), a Student could read `class_offerings` directly.
-- Once 0190's widened key lets two Offerings share a name+section (a
-- Morning and a Day "Nine - A"), `student_in_class` -- an EXISTS check
-- against the Student's own class_name/section text, not a specific row --
-- returns true for BOTH rows, so a Morning Student's direct read of
-- class_offerings would also return the Day Offering's row (its
-- class_teacher_id included) -- an Offering she has no Enrollment in.
--
-- First attempt at this fix (applied, then corrected in place before this
-- migration was ever committed) wrote the replacement as a raw EXISTS
-- clause inline in the policy, not a function -- and found empirically,
-- not by inspection, that this returns nothing for any Student at all:
-- neither `students` nor `student_enrollments` carries a Student-facing
-- SELECT policy (a Student reads herself only through `student_self`, a
-- SECURITY DEFINER view that bypasses RLS on her behalf). An inline
-- `USING` clause runs under the CALLING role's own RLS, so a plain EXISTS
-- referencing those two tables finds nothing for a Student session,
-- regardless of the actual data -- exactly why `student_in_class` (the
-- function this migration retires) was SECURITY DEFINER in the first
-- place. Replaced with a same-shaped SECURITY DEFINER function rather than
-- repeating that mistake.
create function public.student_current_class_offering_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select se.class_offering_id
  from students me
  join student_enrollments se on se.id = me.current_enrollment_id
  where me.profile_id = auth.uid()
    and me.archived_at is null
$function$;

revoke execute on function public.student_current_class_offering_id() from anon, public;
grant execute on function public.student_current_class_offering_id() to authenticated;

comment on function public.student_current_class_offering_id() is
  'The CALLING Student''s (auth.uid()) own current Class Offering id, or '
  'null if unplaced -- backs "student reads own class offering" (issue '
  '#593). SECURITY DEFINER because neither students nor student_enrollments '
  'carries a Student-facing SELECT policy of their own (a Student reads '
  'herself only through student_self); the same reason student_in_class(), '
  'which this replaces, was SECURITY DEFINER too.';

-- Wrapped in `(select ...)`, per this codebase's own established RLS
-- convention (0150): a zero-argument definer call is constant across the
-- whole scan, and the wrap lets Postgres hoist it into a one-shot InitPlan
-- instead of re-evaluating it (and its own students/student_enrollments
-- join) once per candidate row.
alter policy "student reads own class offering" on public.class_offerings
  using (id = (select public.student_current_class_offering_id()));

-- student_in_class(uuid, text, text) -- confirmed dead: this was its only
-- caller (checked both pg_policies.qual and every function body, having
-- been burned once already in this same ticket by staff_capacity_for_class
-- looking dead when it wasn't). Same text-based pattern this ticket is
-- otherwise retiring throughout.
drop function if exists public.student_in_class(uuid, text, text);
