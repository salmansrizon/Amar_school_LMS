-- 0244_student_roll_unique_in_offering.sql
-- Issue #690 (Two students can be saved with the same roll in one class).
-- Index item 3.5.
-- WRITTEN, NOT APPLIED. The app works with and without it (the same check runs
-- in web/lib/school/roll-check.ts before a roll is written).
--
-- WHAT WAS FOUND (by reading the migrations and the code; the live database
-- was NOT queried - the pre-check below is how to confirm it)
--   Both uniqueness rules the issue asks about exist in the migrations:
--     students_roll_unique              (0120) unique (school_id, class_name,
--                                       coalesce(section,''), roll_number)
--                                       where roll_number and class_name are not null
--     student_enrollments_roll_unique   (0181) unique (class_offering_id, roll_number)
--                                       where roll_number is not null and closed_at is null
--   A later browser check could not reproduce the issue for ADMISSION: the
--   second student with the same roll was refused in Bangla.
--   The gap that remains is the EDIT form. It writes only students.roll_number
--   (the copy lists, ID cards and print pages show) and never the Enrollment's
--   roll. students_roll_unique is keyed on class TEXT, so it does not fire when
--   the Student's class_name is empty or differs from a classmate's - while
--   both are current members of the same Class Offering. Two Students of one
--   Offering can then show the same roll and neither index objects.
--
-- WHAT
--   A BEFORE UPDATE OF roll_number trigger on public.students. When a Student
--   who is placed in a Class Offering gets a roll that is NOT the one their own
--   Enrollment carries (so: a manual edit), the trigger refuses it if another
--   current member of that Offering holds the same number in either copy. It
--   raises SQLSTATE 23505 naming "students_roll_unique", so the app shows its
--   existing "that roll is taken" message (friendlyStudentError).
--
-- WHY A TRIGGER AND NOT A UNIQUE INDEX
--   A unique index is checked against every existing row when it is created and
--   fails if one duplicate exists. This must not fail on existing duplicate
--   rolls, so it checks only rows being written from now on. Existing
--   duplicates stay exactly as they are and can still be saved unchanged.
--
-- WHAT IT DELIBERATELY LETS THROUGH
--   - A write that sets the legacy roll to the Student's own Enrollment roll.
--     That is the sync step after admission, transfer and promotion
--     (admitStudent, sync_student_legacy_placement - 0186). The Enrollment roll
--     is already unique per Offering (0181), so these never need a second look,
--     and bulk promotion cannot be blocked by another Student's stale legacy roll.
--   - A Student with no placement (current_enrollment_id null) and a null roll.
--   - INSERT: at admission the placement does not exist yet; the app pre-check
--     and student_enrollments_roll_unique cover that path.
--
-- EFFECT ON EXISTING DATA
--   None. No row is read into a change, rewritten or deleted.
--
-- EFFECT PER ROLE
--   School Owner, office staff, class teacher (the roles that can edit a
--   Student): a manual roll edit to a number a classmate already holds is now
--   refused with the existing message. Every other edit is unchanged.
--   Subject teacher, Student, anon: no change (they cannot update students).
--
-- CALLERS OF A students.roll_number UPDATE, AND WHY THEY STILL WORK
--   web/app/school/students/actions.ts updateStudent   the edit form: now checked (intended).
--   web/app/school/students/actions.ts admitStudent    sync to the Enrollment roll: let through.
--   sync_student_legacy_placement (0186)               p_new_roll is the Enrollment roll: let
--     (transferStudent, the Promotion action)          through; null (scope changed): let through.
--   assign_student_roll (0120)                         BEFORE INSERT only: this trigger does not fire.
--   Nothing else writes the column (grep over web/app, web/lib, web/supabase/migrations).
--
-- PRE-CHECK (read-only; run before applying, keep the output). Queries 1-2
-- answer the issue's "not yet known"; 3-5 size the cleanup. None of them has
-- to return zero for this file to apply.
--   -- 1. The two indexes exist, are valid, and cover what the migrations say.
--   select c.relname, i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid)
--     from pg_index i join pg_class c on c.oid = i.indexrelid
--    where c.relname in ('students_roll_unique', 'student_enrollments_roll_unique');
--   --    Expect 2 rows, both unique and valid. If one is MISSING or invalid and
--   --    query 3 (for the enrollment index) or query 4 (for the students index)
--   --    returns no rows, it can be re-created with the statement from 0181 /
--   --    0120. If duplicates exist, clean them first - do not force it.
--
--   -- 2. The issue's two test students ("FIX-People ... R1" / "... R2").
--   select s.id, s.full_name, s.class_name, s.section, s.roll_number as shown_roll,
--          e.class_offering_id, e.roll_number as enrollment_roll, e.closed_at, s.archived_at
--     from public.students s
--     left join public.student_enrollments e on e.id = s.current_enrollment_id
--    where s.full_name like 'FIX-People%'
--    order by s.full_name;
--
--   -- 3. Duplicate ENROLLMENT rolls in one Offering (expect 0 rows while the index is valid).
--   select class_offering_id, roll_number, count(*) from public.student_enrollments
--    where roll_number is not null and closed_at is null
--    group by 1, 2 having count(*) > 1;
--
--   -- 4. Duplicate SHOWN rolls in one Offering - what a user sees as the bug.
--   select e.class_offering_id, s.roll_number, count(*) as students, array_agg(s.id) as student_ids
--     from public.students s
--     join public.student_enrollments e on e.id = s.current_enrollment_id and e.closed_at is null
--    where s.roll_number is not null
--    group by 1, 2 having count(*) > 1
--    order by 1, 2;
--
--   -- 5. Students whose two copies disagree (drift from earlier edits).
--   select count(*) from public.students s
--     join public.student_enrollments e on e.id = s.current_enrollment_id and e.closed_at is null
--    where s.roll_number is distinct from e.roll_number;
--
-- ROLLBACK (exact, in this order)
--   drop trigger if exists student_roll_unique_in_offering on public.students;
--   drop function if exists public.enforce_student_roll_unique_in_offering();
--   notify pgrst, 'reload schema';

create or replace function public.enforce_student_roll_unique_in_offering() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_offering uuid;
  v_enrollment_roll integer;
begin
  -- Nothing to check: no roll, no placement, or the roll did not change.
  if new.roll_number is null
     or new.current_enrollment_id is null
     or new.roll_number is not distinct from old.roll_number then
    return new;
  end if;

  select e.class_offering_id, e.roll_number
    into v_offering, v_enrollment_roll
    from student_enrollments e
   where e.id = new.current_enrollment_id and e.closed_at is null;
  if v_offering is null then
    return new;
  end if;

  -- The sync after admission / transfer / promotion: already unique by 0181.
  if v_enrollment_roll is not distinct from new.roll_number then
    return new;
  end if;

  -- Same lock assign_enrollment_roll takes (0181), so two edits into one
  -- Offering cannot both pass the check below.
  perform pg_advisory_xact_lock(hashtextextended(v_offering::text, 0));

  if exists (
    select 1
      from student_enrollments e
      join students s on s.current_enrollment_id = e.id
     where e.class_offering_id = v_offering
       and e.closed_at is null
       and s.id <> new.id
       and (s.roll_number = new.roll_number or e.roll_number = new.roll_number)
  ) then
    raise exception using
      errcode = 'unique_violation',
      constraint = 'students_roll_unique',
      message = 'duplicate key value violates unique constraint "students_roll_unique"',
      detail = format('Roll %s is already held in this class offering.', new.roll_number);
  end if;

  return new;
end $$;

-- A trigger function needs no EXECUTE grant: the trigger mechanism does not
-- check it. Closing the default grant only removes it as an RPC (0150).
revoke execute on function public.enforce_student_roll_unique_in_offering() from public;
revoke execute on function public.enforce_student_roll_unique_in_offering() from anon;
revoke execute on function public.enforce_student_roll_unique_in_offering() from authenticated;

drop trigger if exists student_roll_unique_in_offering on public.students;
create trigger student_roll_unique_in_offering
  before update of roll_number on public.students
  for each row execute function public.enforce_student_roll_unique_in_offering();

notify pgrst, 'reload schema';
