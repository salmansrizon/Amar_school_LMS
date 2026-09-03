-- 0178_students_current_enrollment_pointer.sql
-- Wave 1 (issue #584), implementing #569's and #573's resolutions.
--
-- The sole authoritative pointer to a Student's current Enrollment (#573).
-- Either NULL or references exactly one existing student_enrollments row
-- belonging to that same Student -- no second `is_current` flag anywhere.
-- Nullable: a Student with no current Enrollment (not yet placed by Wave 6,
-- or genuinely unplaced) must not be treated as an error (#569's binding
-- requirement) -- it is a valid, visible-to-the-Owner state, just narrowed
-- out of Class/Subject Teacher reach by the capacity functions Wave 2 adds.
--
-- This column, once populated, is what every redesigned capacity function
-- (Wave 2, #585) joins through instead of matching students.class_name/
-- section against classes by text.

alter table public.students
  add column current_enrollment_id uuid references public.student_enrollments (id);

create index students_current_enrollment_idx on public.students (current_enrollment_id);

comment on column public.students.current_enrollment_id is
  'Sole authoritative pointer to this Student''s current student_enrollments row '
  '(issue #569/#573, map #568/#582). NULL means no current placement -- a valid '
  'state, not corruption. Populated for existing Students by Wave 6 (#591); set '
  'going forward only by the approved transition functions (Wave 2, #585).';
