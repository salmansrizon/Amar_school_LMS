-- Review hardening (issue #45 greploop): the slot tenancy trigger must also
-- verify class_id belongs to the slot's School, and the syllabus storage
-- UPDATE policy needs WITH CHECK so an object can't be renamed into another
-- School's folder. Additive only.

create or replace function public.enforce_routine_slot_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from classes where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  if new.subject_id is not null and not exists (
    select 1 from subjects where id = new.subject_id and school_id = new.school_id
  ) then
    raise exception 'subject does not belong to this school';
  end if;
  if new.teacher_id is not null and not exists (
    select 1 from employees where id = new.teacher_id and school_id = new.school_id
  ) then
    raise exception 'teacher does not belong to this school';
  end if;
  if new.room_id is not null and not exists (
    select 1 from rooms where id = new.room_id and school_id = new.school_id
  ) then
    raise exception 'room does not belong to this school';
  end if;
  return new;
end $$;

alter policy "school members update own syllabus objects" on storage.objects
  with check (
    bucket_id = 'syllabus'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
