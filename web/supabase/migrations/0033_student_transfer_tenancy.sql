-- Students I hardening (issue #27): student_transfers accepts a client-supplied
-- student_id, so without a tenancy check a member of another School could plant
-- a transfer row referencing a foreign student (their own school_id passes
-- RLS). Same pattern as enforce_class_ref_school (0029). Additive only.

create function public.enforce_student_ref_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from students where id = new.student_id and school_id = new.school_id
  ) then
    raise exception 'student does not belong to this school';
  end if;
  return new;
end $$;

create trigger student_transfer_same_school
  before insert or update on public.student_transfers
  for each row execute function public.enforce_student_ref_school();
