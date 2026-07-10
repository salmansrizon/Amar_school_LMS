-- Review hardening round 2 (issue #45 greploop): class_routines and
-- class_syllabi accept a client-supplied class_id and have no tenancy trigger,
-- so a foreign class UUID could plant a ghost row (own school_id passes RLS)
-- that blocks the real School's upsert forever. Verify class tenancy at the
-- data layer, like routine_slots already does. Additive only.

create function public.enforce_class_ref_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from classes where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  return new;
end $$;

create trigger class_routine_same_school
  before insert or update on public.class_routines
  for each row execute function public.enforce_class_ref_school();

create trigger class_syllabus_same_school
  before insert or update on public.class_syllabi
  for each row execute function public.enforce_class_ref_school();
