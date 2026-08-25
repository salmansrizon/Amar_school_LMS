-- Section-scoped roll numbers + configurable increment (issue #503,
-- docs/012_student_roll_default_subject.md). Additive only.
--
-- assign_student_roll (0032, hardened in 0034) scoped its max()/advisory-lock/
-- unique-index by school_id + class_name only, so Section B's next roll was
-- pushed past whatever Section A had already used. Rescope all three to
-- school_id + class_name + section, and read the increment from a new
-- per-school setting instead of the hardcoded +1.

alter table public.schools
  add column roll_number_increment int not null default 1
    constraint schools_roll_number_increment_positive check (roll_number_increment > 0);

create or replace function public.assign_student_roll() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  increment int;
begin
  if new.roll_number is null and new.class_name is not null then
    -- Serialize concurrent admissions to the same School+class+section
    -- (released at commit). class_name/section are free text elsewhere in the
    -- app, so a ':'-joined string key could collide (class_name='A',
    -- section='B:C' vs. class_name='A:B', section='C' both join to 'A:B:C') —
    -- hash each component separately, with a distinct seed per position, and
    -- XOR them together instead, so no delimiter or field-order ambiguity is
    -- possible.
    perform pg_advisory_xact_lock(
      hashtextextended(new.school_id::text, 0) #
      hashtextextended(new.class_name, 1) #
      hashtextextended(coalesce(new.section, ''), 2)
    );
    select roll_number_increment into increment from schools where id = new.school_id;
    select coalesce(max(roll_number), 0) + coalesce(increment, 1) into new.roll_number
    from students
    where school_id = new.school_id
      and class_name = new.class_name
      and section is not distinct from new.section;
  end if;
  return new;
end $$;

-- Replaces the class-only unique backstop from 0034. A plain (…, section, …)
-- column would let two null-section rows collide silently (unique indexes
-- treat NULL as distinct from NULL) — coalesce to '' so a class with no
-- sections is still enforced.
drop index if exists public.students_roll_unique;
create unique index students_roll_unique
  on public.students (school_id, class_name, coalesce(section, ''), roll_number)
  where roll_number is not null and class_name is not null;

-- transfer_student (0035, shift dropped in 0060): roll_number was reset only
-- on a class change. Roll is now section-scoped too, so a section-only move
-- must also reset it (an explicit roll can still be set afterwards via edit,
-- or in the same call via p_new_roll on the promotion overload below).
create or replace function public.transfer_student(
  p_student_id uuid,
  p_to_class text,
  p_to_section text,
  p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target students%rowtype;
  scope_changed boolean;
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

  scope_changed := p_to_class is distinct from target.class_name
    or p_to_section is distinct from target.section;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      roll_number = case when scope_changed then null else roll_number end
  where id = p_student_id;
end $$;

revoke execute on function public.transfer_student(uuid, text, text, text) from anon, public;
grant execute on function public.transfer_student(uuid, text, text, text) to authenticated;

-- Promotion overload (0048/0060): same scope_changed widening; p_new_roll
-- still wins outright when the caller supplies one (Promotion always does).
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
  scope_changed boolean;
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

  scope_changed := p_to_class is distinct from target.class_name
    or p_to_section is distinct from target.section;
  update students
  set class_name = p_to_class,
      section = p_to_section,
      roll_number = case
        when p_new_roll is not null then p_new_roll
        when scope_changed then null
        else roll_number
      end
  where id = p_student_id;
end $$;

revoke execute on function public.transfer_student(uuid, text, text, text, int) from anon, public;
grant execute on function public.transfer_student(uuid, text, text, text, int) to authenticated;
