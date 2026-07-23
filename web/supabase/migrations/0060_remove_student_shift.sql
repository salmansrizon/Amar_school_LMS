-- Remove the student-side Shift concept (issue #100, map #91,
-- docs/improvement.md Known Issues §2).
--
-- Shift was born employee-side (0012: grace_minutes, starts_at/ends_at,
-- employee_shifts) and students borrowed it later. Only the STUDENT side goes
-- (map #91 grilling decision 1): employee office-time windows drive late/early
-- detection and the grace MAX-rule, and deleting them would delete working
-- behaviour. The employee-side concept is renamed to Office Time in #102.
--
-- No backfill (grilling decision 4): class + section already carry the
-- grouping, and a school that wants the distinction renames its own sections
-- to the `Morning - A` / `Day - C` convention. `main` is pre-launch, so the
-- column drop lands on the shared database directly.

-- 1. transfer_student loses its shift parameter. The 0036 "blank shift means
--    unchanged" rule goes with it — there is no shift to keep.
drop function if exists public.transfer_student(uuid, text, text, uuid, text);

create or replace function public.transfer_student(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target students%rowtype;
  class_changed boolean;
begin
  select * into target from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  insert into student_transfers (
    student_id, from_class, from_section, to_class, to_section, note
  ) values (
    p_student_id, target.class_name, target.section, p_to_class, p_to_section, p_note
  );

  class_changed := p_to_class is distinct from target.class_name;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      -- Roll is reset on a class change so rolls stay per class (preserved
      -- from 0035; an explicit roll can be set afterwards via edit).
      roll_number = case when class_changed then null else roll_number end
  where id = p_student_id;
end $$;

revoke execute on function public.transfer_student(uuid, text, text, text) from anon, public;
grant execute on function public.transfer_student(uuid, text, text, text) to authenticated;

-- 2. Publication targeting drops its shift dimension, and the tenancy trigger
--    that guarded it has nothing left to guard.
drop trigger if exists publication_shift_same_school on public.publications;
drop function if exists public.enforce_publication_shift_school();

alter table public.publications drop constraint if exists publications_target_all_is_clean;
alter table public.publications drop column if exists target_shift_id;
alter table public.publications
  add constraint publications_target_all_is_clean check (
    target_type = 'specific'
    or (target_class_name is null and target_section is null)
  );

-- 3. The student-side columns themselves. student_transfers' shift columns go
--    with them: a transfer log that records a concept the product no longer
--    has is noise an operator has to explain away.
alter table public.student_transfers drop column if exists from_shift_id;
alter table public.student_transfers drop column if exists to_shift_id;
alter table public.students drop column if exists shift_id;

-- 4. The promotion overload (0048's transfer_student with p_new_roll) carried
--    its own shift handling and would break the moment students.shift_id went.
--    Same signature minus the shift parameter; p_new_roll behaviour unchanged.
drop function if exists public.transfer_student(uuid, text, text, uuid, text, integer);

create or replace function public.transfer_student(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_note text,
  p_new_roll int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target students%rowtype;
  class_changed boolean;
begin
  select * into target from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  insert into student_transfers (
    student_id, from_class, from_section, to_class, to_section, note
  ) values (
    p_student_id, target.class_name, target.section, p_to_class, p_to_section, p_note
  );

  class_changed := p_to_class is distinct from target.class_name;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      roll_number = case
        when p_new_roll is not null then p_new_roll
        when class_changed then null
        else roll_number
      end
  where id = p_student_id;
end $$;

revoke execute on function public.transfer_student(uuid, text, text, text, int) from anon, public;
grant execute on function public.transfer_student(uuid, text, text, text, int) to authenticated;
