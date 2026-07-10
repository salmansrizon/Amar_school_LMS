-- Weekly class routine builder (issue #45, PRD §5.4): a per-class grid of
-- day×period slots, each optionally assigning a subject, teacher and room, with
-- School-wide conflict-free guarantees, plus a per-class publish marker.
-- Additive only.

-- Publish marker per class (absent row = never published / draft).
create table public.class_routines (
  class_id uuid primary key references public.classes (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  published_at timestamptz
);
alter table public.class_routines enable row level security;
create policy "school members manage class_routines" on public.class_routines
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages class_routines" on public.class_routines
  for all using (public.app_current_role() = 'super_admin');

-- One slot per (class, day, period). day_of_week 0=Sunday..6=Saturday
-- (Bangladesh working week is typically Sun–Thu). period 1..12.
create table public.routine_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  class_id uuid not null references public.classes (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  period smallint not null check (period between 1 and 12),
  subject_id uuid references public.subjects (id) on delete set null,
  teacher_id uuid references public.employees (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, day_of_week, period)
);
create index routine_slots_class_idx on public.routine_slots (class_id);

-- Conflict-free assignment: a teacher, and a room, may each appear in only one
-- slot per (day, period) across the whole School. Partial unique indexes reject
-- the double-booking with a unique_violation the app surfaces as a conflict.
create unique index routine_slots_teacher_conflict
  on public.routine_slots (school_id, day_of_week, period, teacher_id)
  where teacher_id is not null;
create unique index routine_slots_room_conflict
  on public.routine_slots (school_id, day_of_week, period, room_id)
  where room_id is not null;

alter table public.routine_slots enable row level security;
create policy "school members manage routine_slots" on public.routine_slots
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages routine_slots" on public.routine_slots
  for all using (public.app_current_role() = 'super_admin');

-- A slot's subject/teacher/room must belong to the same School as the slot.
-- (Single-column FKs above guarantee existence but not tenancy; RLS hides other
-- schools' ids from the app, this closes the gap at the data layer too.) Runs
-- security definer so it can read past RLS to verify tenancy.
create function public.enforce_routine_slot_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

create trigger routine_slot_same_school
  before insert or update on public.routine_slots
  for each row execute function public.enforce_routine_slot_school();
