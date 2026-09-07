-- 0189_class_teacher_profile_for_by_enrollment.sql
-- Issue #593 (map #582's follow-up), step 1 of 2 -- fix the consumer before
-- widening class_offerings' uniqueness key in 0190.
--
-- class_teacher_profile_for(p_school, p_class, p_section) has resolved a new
-- Student question's Class Teacher via `c.name = p_class and
-- coalesce(c.section,'') = coalesce(p_section,'') limit 1` since migration
-- 0148 -- deterministic today only because class_offerings' current
-- (school_id, name, section) uniqueness (0155, then 0023 before it)
-- guarantees at most one match. 0190 is about to widen that key so a School
-- can legitimately have TWO Class Offerings sharing a name+section (differing
-- by Shift/Academic Year/Group Department) -- once that lands, this
-- function's `limit 1` would silently pick an arbitrary one of them,
-- routing a Student's question to the wrong teacher rather than raising an
-- error. That must not ship even transiently, so this migration goes first.
--
-- Redesigned around the Student's own current Enrollment instead of text
-- matching -- the same model every other post-#569 resolution uses.
-- Signature drops to zero arguments and resolves the CALLING student via
-- auth.uid() directly (matching student_matches_target()'s own pattern),
-- rather than taking a student id as a parameter: this function only ever
-- needs to answer "who is MY class teacher", so there is no legitimate
-- caller who needs to ask it about a different Student, and accepting an
-- arbitrary p_student_id would let any authenticated caller probe which
-- teacher (profile_id) is attached to any Student's class in any School --
-- a real, if narrow, cross-tenant leak this construction closes by
-- structurally not accepting the parameter at all, not by relying on an
-- authorization check that could later be forgotten or weakened. Resolves
-- to null (nobody to notify, same fallback the caller already handles) for
-- an unplaced Student (current_enrollment_id is null) or a Class Offering
-- with no Class Teacher assigned -- identical to the old function's
-- behavior for those same cases.
drop function if exists public.class_teacher_profile_for(uuid, text, text);

create function public.class_teacher_profile_for()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.profile_id
  from students s
  join student_enrollments se on se.id = s.current_enrollment_id
  join class_offerings c on c.id = se.class_offering_id
  join employees e on e.id = c.class_teacher_id
  where s.profile_id = auth.uid()
    and s.archived_at is null
$function$;

revoke execute on function public.class_teacher_profile_for() from anon, public;
grant execute on function public.class_teacher_profile_for() to authenticated;

comment on function public.class_teacher_profile_for() is
  'The CALLING Student''s (auth.uid()) own Class Teacher profile_id, for '
  'routing a new-question push notification -- resolved via their current '
  'Enrollment''s Class Offering (map #568/#582, issue #593), not the legacy '
  '(name, section) text + limit 1 match. Zero arguments deliberately: only '
  'ever answers for the calling Student, never an arbitrary one, closing off '
  'a cross-tenant probing surface by construction.';
