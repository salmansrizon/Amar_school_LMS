-- Exams II (issue #47, PRD §5.5): exam setup deepening (class/date link,
-- grading-scheme pick), subject-teacher assignment, exam routine, and
-- seat-plan assignment with room-capacity + duplicate-range checks. Builds on
-- the Open/Closed exam entity (issue #8) and grading_schemes (issue #31) —
-- extends, does not rework, the close-state immutability rule. Additive only
-- (staging and main share this database).

-- Exam setup "Basic Info" / "Grading Scheme" cards (exam-setup.html): link an
-- exam to a class + start date + an existing named grading scheme.
alter table public.exams
  add column class_id uuid references public.classes (id) on delete set null,
  add column start_date date,
  add column grading_scheme_id uuid references public.grading_schemes (id) on delete set null,
  add column seat_plan_published_at timestamptz;

-- Shared predicate: is this exam still Open? Child tables below use it to
-- extend the Closed-exam immutability rule (enforce_exam_close, issue #8,
-- guards only the exams row itself) to their own writes.
create function public.exam_is_open(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from exams where id = eid and status = 'open')
$$;

-- An exam's class/grading-scheme must belong to its own School (mirrors
-- enforce_grade_band_school / enforce_routine_slot_school).
create function public.enforce_exam_refs_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and not exists (
    select 1 from classes where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  if new.grading_scheme_id is not null and not exists (
    select 1 from grading_schemes where id = new.grading_scheme_id and school_id = new.school_id
  ) then
    raise exception 'grading scheme does not belong to this school';
  end if;
  return new;
end $$;

create trigger exam_refs_same_school
  before insert or update on public.exams
  for each row execute function public.enforce_exam_refs_school();

-- Subject-teacher assignment: one assigned teacher per subject per exam.
create table public.exam_subject_teachers (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  teacher_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, subject_id)
);
create index exam_subject_teachers_exam_idx on public.exam_subject_teachers (exam_id);

alter table public.exam_subject_teachers enable row level security;
create policy "school members manage exam_subject_teachers" on public.exam_subject_teachers
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_subject_teachers" on public.exam_subject_teachers
  for all using (public.app_current_role() = 'super_admin');

-- Exam routine: one scheduled sitting per subject per exam.
create table public.exam_routine_entries (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  exam_date date not null,
  start_time time not null,
  end_time time not null,
  room_id uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, subject_id),
  constraint exam_routine_time_order check (end_time > start_time)
);
create index exam_routine_entries_exam_idx on public.exam_routine_entries (exam_id);

alter table public.exam_routine_entries enable row level security;
create policy "school members manage exam_routine_entries" on public.exam_routine_entries
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_routine_entries" on public.exam_routine_entries
  for all using (public.app_current_role() = 'super_admin');

-- Seat plan: one room-range assignment per room per exam. The range's SIZE
-- (not headcount) is capped at the room's capacity, exactly as the mockup's
-- Room/Capacity/Assigned Roll Range table implies — a hard DB constraint per
-- the ticket's "enforce server-side" requirement for room-capacity checks.
create table public.exam_seat_plans (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  roll_start int not null check (roll_start > 0),
  roll_end int not null check (roll_end >= roll_start),
  created_at timestamptz not null default now(),
  unique (exam_id, room_id)
);
create index exam_seat_plans_exam_idx on public.exam_seat_plans (exam_id);

alter table public.exam_seat_plans enable row level security;
create policy "school members manage exam_seat_plans" on public.exam_seat_plans
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages exam_seat_plans" on public.exam_seat_plans
  for all using (public.app_current_role() = 'super_admin');

-- Tenancy + closed-exam guard shared shape across the three child tables:
-- exam_id/subject_id/teacher_id/room_id must belong to the row's own School,
-- and no write is accepted once the parent exam is Closed (super_admin exempt,
-- mirrors enforce_exam_close's vendor-maintenance exemption, issue #8).
create function public.enforce_exam_subject_teacher_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() <> 'super_admin' and not public.exam_is_open(new.exam_id) then
    raise exception 'exam is closed';
  end if;
  if not exists (select 1 from exams where id = new.exam_id and school_id = new.school_id) then
    raise exception 'exam does not belong to this school';
  end if;
  if not exists (select 1 from subjects where id = new.subject_id and school_id = new.school_id) then
    raise exception 'subject does not belong to this school';
  end if;
  if new.teacher_id is not null and not exists (
    select 1 from employees where id = new.teacher_id and school_id = new.school_id
  ) then
    raise exception 'teacher does not belong to this school';
  end if;
  return new;
end $$;

create trigger exam_subject_teacher_same_school
  before insert or update on public.exam_subject_teachers
  for each row execute function public.enforce_exam_subject_teacher_school();

create function public.enforce_exam_routine_entry_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() <> 'super_admin' and not public.exam_is_open(new.exam_id) then
    raise exception 'exam is closed';
  end if;
  if not exists (select 1 from exams where id = new.exam_id and school_id = new.school_id) then
    raise exception 'exam does not belong to this school';
  end if;
  if not exists (select 1 from subjects where id = new.subject_id and school_id = new.school_id) then
    raise exception 'subject does not belong to this school';
  end if;
  if new.room_id is not null and not exists (
    select 1 from rooms where id = new.room_id and school_id = new.school_id
  ) then
    raise exception 'room does not belong to this school';
  end if;
  return new;
end $$;

create trigger exam_routine_entry_same_school
  before insert or update on public.exam_routine_entries
  for each row execute function public.enforce_exam_routine_entry_school();

create function public.enforce_exam_seat_plan_school() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
begin
  if public.app_current_role() <> 'super_admin' and not public.exam_is_open(new.exam_id) then
    raise exception 'exam is closed';
  end if;
  if not exists (select 1 from exams where id = new.exam_id and school_id = new.school_id) then
    raise exception 'exam does not belong to this school';
  end if;
  select capacity into cap from rooms where id = new.room_id and school_id = new.school_id;
  if cap is null then
    raise exception 'room does not belong to this school';
  end if;
  if (new.roll_end - new.roll_start + 1) > cap then
    raise exception 'roll range exceeds room capacity';
  end if;
  return new;
end $$;

create trigger exam_seat_plan_same_school
  before insert or update on public.exam_seat_plans
  for each row execute function public.enforce_exam_seat_plan_school();

-- Immutability extends to removal too, not just insert/update.
create function public.enforce_exam_child_open_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() <> 'super_admin' and not public.exam_is_open(old.exam_id) then
    raise exception 'exam is closed';
  end if;
  return old;
end $$;

create trigger exam_subject_teacher_delete_guard
  before delete on public.exam_subject_teachers
  for each row execute function public.enforce_exam_child_open_on_delete();
create trigger exam_routine_entry_delete_guard
  before delete on public.exam_routine_entries
  for each row execute function public.enforce_exam_child_open_on_delete();
create trigger exam_seat_plan_delete_guard
  before delete on public.exam_seat_plans
  for each row execute function public.enforce_exam_child_open_on_delete();

-- Generate Seat Plan: replace the exam's seat-plan rows by walking the exam's
-- class's students (ordered by roll number) into the school's active rooms
-- (ordered by name); each room absorbs as many consecutive-by-roll students as
-- fit within its capacity's RANGE SPAN (not raw headcount), so a gappy roll
-- sequence (e.g. an archived student) can never produce a range the capacity
-- trigger above would then reject. One transaction (mirrors transfer_student/
-- close_exam) so a partial fill can't be observed.
create function public.generate_seat_plan(exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target exams%rowtype;
  cls classes%rowtype;
  room record;
  rolls int[];
  i int := 1;
  j int;
  n int;
  start_roll int;
begin
  select * into target from exams where id = exam for update;
  if not found then
    raise exception 'unknown exam';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'exam not accessible';
  end if;
  if target.status <> 'open' then
    raise exception 'exam is closed';
  end if;
  if target.class_id is null then
    raise exception 'exam has no class set';
  end if;

  select * into cls from classes where id = target.class_id;

  select array_agg(roll_number order by roll_number) into rolls
  from students
  where school_id = target.school_id
    and class_name = cls.name
    and ((cls.section is null and section is null) or section = cls.section)
    and roll_number is not null
    and archived_at is null;

  delete from exam_seat_plans where exam_id = exam;

  if rolls is null or array_length(rolls, 1) is null then
    return;
  end if;
  n := array_length(rolls, 1);

  for room in
    select id, capacity from rooms
    where school_id = target.school_id and is_active
    order by name
  loop
    exit when i > n;
    start_roll := rolls[i];
    j := i;
    while j < n and (rolls[j + 1] - start_roll + 1) <= room.capacity loop
      j := j + 1;
    end loop;
    insert into exam_seat_plans (exam_id, school_id, room_id, roll_start, roll_end)
    values (exam, target.school_id, room.id, start_roll, rolls[j]);
    i := j + 1;
  end loop;
end $$;

revoke execute on function public.generate_seat_plan(uuid) from anon, public;
grant execute on function public.generate_seat_plan(uuid) to authenticated;

-- Publish Seat Plan: server-side duplicate-range (overlap) check — the "not
-- just client validation" requirement. Rejects if any two rooms' ranges
-- overlap; otherwise stamps the exam's publish marker.
create function public.publish_seat_plan(exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target exams%rowtype;
  overlap_count int;
begin
  select * into target from exams where id = exam for update;
  if not found then
    raise exception 'unknown exam';
  end if;
  if target.school_id is distinct from public.app_current_school_id() then
    raise exception 'exam not accessible';
  end if;
  if target.status <> 'open' then
    raise exception 'exam is closed';
  end if;

  select count(*) into overlap_count
  from exam_seat_plans a
  join exam_seat_plans b
    on a.exam_id = b.exam_id and a.id < b.id
  where a.exam_id = exam
    and a.roll_start <= b.roll_end and a.roll_end >= b.roll_start;

  if overlap_count > 0 then
    raise exception 'roll ranges overlap — resolve before publishing';
  end if;

  update exams set seat_plan_published_at = now() where id = exam;
end $$;

revoke execute on function public.publish_seat_plan(uuid) from anon, public;
grant execute on function public.publish_seat_plan(uuid) to authenticated;
