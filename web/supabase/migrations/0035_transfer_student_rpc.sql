-- Review hardening (issue #27 greploop round 2): transferStudent wrote the
-- student_transfers history row and the students update as two separate
-- PostgREST calls (two transactions) — a failure between them could leave an
-- orphaned history row claiming a transfer that never applied. Same pattern
-- as close_exam (0014): the whole transfer goes through one RPC, one
-- transaction. Additive only.

create function public.transfer_student(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_to_shift_id uuid,
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
    student_id, from_class, from_section, from_shift_id,
    to_class, to_section, to_shift_id, note
  ) values (
    p_student_id, target.class_name, target.section, target.shift_id,
    p_to_class, p_to_section, p_to_shift_id, p_note
  );

  class_changed := p_to_class is distinct from target.class_name;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      shift_id = p_to_shift_id,
      -- Roll is reset on a class change so rolls stay per class (an explicit
      -- roll can be set afterwards via edit).
      roll_number = case when class_changed then null else roll_number end
  where id = p_student_id;
end $$;
