-- Review hardening: transfer_student set shift_id = p_to_shift_id
-- unconditionally, so leaving the transfer form's "New Shift" select blank
-- (the common promote-to-next-class-keep-same-shift case) silently cleared
-- the student's shift. A blank shift now means "unchanged", mirroring how
-- roll_number is already kept-if-unchanged for a same-class transfer.
-- Additive only (create or replace, same signature).

create or replace function public.transfer_student(
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
  resolved_shift_id uuid;
begin
  select * into target from students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'student not accessible';
  end if;

  resolved_shift_id := coalesce(p_to_shift_id, target.shift_id);

  insert into student_transfers (
    student_id, from_class, from_section, from_shift_id,
    to_class, to_section, to_shift_id, note
  ) values (
    p_student_id, target.class_name, target.section, target.shift_id,
    p_to_class, p_to_section, resolved_shift_id, p_note
  );

  class_changed := p_to_class is distinct from target.class_name;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      shift_id = resolved_shift_id,
      -- Roll is reset on a class change so rolls stay per class (an explicit
      -- roll can be set afterwards via edit).
      roll_number = case when class_changed then null else roll_number end
  where id = p_student_id;
end $$;
