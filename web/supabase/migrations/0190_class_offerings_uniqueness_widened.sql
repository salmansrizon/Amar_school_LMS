-- 0190_class_offerings_uniqueness_widened.sql
-- Issue #593 (map #582's follow-up), step 2 -- run only after 0189 retired
-- class_teacher_profile_for's (name, section) + limit 1 ambiguity, so this
-- migration never has a moment where two same-name-section Offerings could
-- exist while something still resolves between them by chance.
--
-- A second live consumer of the same ambiguity was found applying this
-- migration, not during grilling: `staff_capacity_for_class(school_id,
-- class_name, section)` is NOT dead code (an earlier check of this only
-- searched function bodies and policy `qual` clauses, missing `with_check`)
-- -- it is the live `with_check` on "school members write students" (0163),
-- the actual authorization gate for a Class Teacher editing a Student's
-- profile (ProfileEditor renders unconditionally, not Owner-gated -- RLS is
-- the real boundary here). It uses `bool_or` across every class_offerings
-- row matching the text pair, safe today only because at most one row can
-- match. Once this migration's own widened key allows two Offerings to
-- share a name+section (a Morning and a Day "Nine - A", say), `bool_or`
-- would grant a Class Teacher of ONE of them write access to a Student
-- actually enrolled in the OTHER -- a real cross-class authorization
-- widening, the identical class of risk 0189 already fixed for notification
-- routing, just a second instance.
--
-- Step 1: fix the students write policy first. `current_enrollment_id` is
-- referenced directly (the column on the row `with_check` evaluates, not a
-- function call keyed by `id` -- staff_class_capacity_for_student(id) would
-- look up the row by id, which does not exist yet during an INSERT's
-- with_check evaluation, incorrectly blocking every employee-authored
-- insert rather than just resolving the ambiguity). For an ordinary UPDATE
-- (the actual profile-edit path), current_enrollment_id is untouched by
-- this write (a separate trigger, enforce_current_enrollment_id_via_
-- transition_only, guards it), so it correctly reflects the Student's real
-- placement -- resolved to exactly one Enrollment, hence exactly one
-- Offering, by construction. For an INSERT, current_enrollment_id is null
-- (a fresh admission has no Enrollment until a separate RPC call), so the
-- check fails for any employee -- closing a pre-existing gap as a side
-- effect: today's text-based check could let a Class Teacher's raw insert
-- pass if the submitted class_name/section happened to match their own
-- class, which already contradicts ADR 0021's "an Employee cannot admit a
-- student" (Admission is Owner/office-staff work, enforced properly only at
-- admit_student_enrollment's own narrower RPC-level check, not by this
-- table-level policy). Confirmed and accepted explicitly with the user
-- before writing this, not assumed.
alter policy "school members write students" on public.students
  with check (
    school_id = (select public.app_current_school_id())
    and (
      (select public.app_current_employee_id()) is null
      or exists (
        select 1
        from student_enrollments se
        where se.id = current_enrollment_id
          and public.staff_capacity_for_class_offering(se.class_offering_id) = any (array['owner', 'class_teacher'])
      )
    )
  );

-- Step 2: class_name_section_unique (originally 0023, tightened by 0155 for
-- the (school_id, name, section) access-join it protects) has no Shift,
-- Academic Year, or Group Department component. That blocks exactly the
-- scenario Shift's own planning tickets (#576-#580) assumed as its
-- motivating case -- a School running the same Class name/section more than
-- once a day, e.g. a Morning and a Day intake of "Nine - A" -- and the
-- identical, previously unnoticed problem for Group Department (a School
-- running "Nine - A" as both a Science and a Commerce section) and for the
-- ordinary Academic Year rollover (re-creating "Nine - A" next year while
-- last year's row still exists). All three widen together, not two of
-- three, since all three were confirmed broken by the identical
-- missing-column pattern.
--
-- NULLS NOT DISTINCT carries over from the constraint being replaced
-- (Postgres 15+ native support, not a coalesce expression index) -- this is
-- not cosmetic: a No-Shift School's Offerings all have shift = null, and
-- Postgres's *default* unique-index behavior treats every null as distinct
-- from every other null, which would silently let two identical "Nine - A"
-- rows coexist for exactly the Schools 0155 was written to protect. Every
-- nullable column in the widened key (shift, group_department -- section
-- already was) must keep colliding on null, not stop.
alter table public.class_offerings
  drop constraint if exists class_name_section_unique;

alter table public.class_offerings
  add constraint class_offerings_identity_unique
  unique nulls not distinct (school_id, name, section, shift, academic_year, group_department);

comment on constraint class_offerings_identity_unique on public.class_offerings is
  'A Class Offering''s full identity within its School (issue #593) -- name + '
  'section + Shift + Academic Year + Group Department, all NULLS NOT '
  'DISTINCT so a No-Shift/no-Group School''s Offerings still collide '
  'correctly on name+section alone, matching the protection '
  'class_name_section_unique (0023/0155) always gave those Schools. '
  'Superseded that constraint, which had no Shift/Academic Year/Group '
  'Department component and blocked the same-class multiple-intakes-a-day '
  'scenario Shift exists for.';

-- Step 3: staff_capacity_for_class(uuid, text, text) -- genuinely dead now
-- that step 1 removed its last caller. Same text-based (name, section)
-- resolution pattern this migration is otherwise retiring throughout;
-- dropped rather than left as a second copy of the anti-pattern with
-- nothing calling it.
drop function if exists public.staff_capacity_for_class(uuid, text, text);
