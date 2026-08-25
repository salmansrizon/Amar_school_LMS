-- 0134_class_teacher.sql
-- Map #434 / ticket #443: "class teacher" becomes real, per the decision on #435.
-- Additive only — staging and main share one project.

-- ---------------------------------------------------------------------------
-- 1. The bridge from the HR record to a login.
--
-- The schema has had two disconnected worlds for the same human: `employees`
-- (what routine_slots.teacher_id and exam_subject_teachers.teacher_id already
-- point at, no login) and `profiles` with role staff_user (a login, no link back
-- to any employee). This is the link, and it is nullable — most Employees have
-- no login and never will.
alter table public.employees
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists employees_profile_unique
  on public.employees (profile_id) where profile_id is not null;

-- Tenancy, the way every cross-table reference here is guarded. A composite FK
-- is not available (profiles has no (school_id, id) unique key), so it is a
-- trigger — the enforce_class_ref_school pattern from 0029. Without it an owner
-- could link one of their Employees to another school's login by posting a
-- foreign UUID straight at PostgREST.
create or replace function public.enforce_employee_profile_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from profiles p
     where p.id = new.profile_id
       and p.school_id = new.school_id
       and p.role in ('school_owner', 'staff_user')
  ) then
    raise exception 'that login does not belong to this school';
  end if;
  return new;
end $$;

drop trigger if exists employee_profile_same_school on public.employees;
create trigger employee_profile_same_school
  before insert or update on public.employees
  for each row execute function public.enforce_employee_profile_school();

-- ---------------------------------------------------------------------------
-- 2. The class teacher.
--
-- Points at employees.id: the Employee record IS the teacher here, and the
-- routine and exam tables already agree.
--
-- NULLABLE by decision (#435). "Mandatory on every class" is a product rule the
-- Class form enforces, plus a "not set" nudge on the list — because staging and
-- main share a database, so a NOT NULL would break every existing row and every
-- insert on main. Revisit only if that constraint ever lifts.
alter table public.classes add column if not exists class_teacher_id uuid;

-- Composite FK, not a trigger: employees already carries the (school_id, id)
-- unique key 0020 added for exactly this, so the database can enforce
-- same-school on its own. ON DELETE SET NULL names the column explicitly (PG15+)
-- — the default would try to null school_id too, which is NOT NULL.
alter table public.classes drop constraint if exists classes_teacher_same_school;
alter table public.classes add constraint classes_teacher_same_school
  foreign key (school_id, class_teacher_id)
  references public.employees (school_id, id)
  on delete set null (class_teacher_id);

create index if not exists classes_teacher_idx on public.classes (class_teacher_id);
