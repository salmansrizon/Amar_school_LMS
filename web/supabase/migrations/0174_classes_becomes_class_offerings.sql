-- 0174_classes_becomes_class_offerings.sql
-- Wave 1 (issue #584) of the Flexible Academic Structure execution map
-- (#582), implementing #571's resolution.
--
-- In-place rename, not a replace-and-remap: every existing row keeps its
-- existing id, so every existing FK (subjects.class_id, fee_structures.class_id,
-- routine_slots.class_id, syllabus storage's class_id, exam-related tables)
-- keeps resolving against the same underlying rows with zero rewriting.
-- Direct precedent: 0061_office_time_rename.sql (shifts -> office_times).
--
-- academic_year lands nullable here -- Wave 6 (#591) backfills every existing
-- row's value, then tightens the column to `not null`. Landing it `not null`
-- now would fail immediately against the 14 existing rows this table already
-- has (confirmed by Wave 0's audit, issue #583).
--
-- shift lands nullable and stays that way even after Wave 6 -- it is
-- optional forever, per #578's resolution (a No-Shift School's Offerings, or
-- one predating Shift's introduction, both legitimately have no value here).

alter table public.classes rename to class_offerings;

alter table public.class_offerings
  add column academic_year int,
  add column shift text,
  add constraint class_offerings_shift_valid check (
    shift is null or shift in ('Morning', 'Day', 'Evening', 'Night')
  );

-- Cosmetic renames only -- the underlying objects (FKs, RLS enforcement)
-- already survived the table rename automatically; this just keeps the
-- index/constraint/policy names from reading as if they still refer to a
-- table called `classes`, matching how 0061 renamed office_times' own
-- object names.
alter index if exists classes_school_idx rename to class_offerings_school_idx;
alter index if exists classes_school_name_section_unique
  rename to class_offerings_school_name_section_unique;
alter index if exists classes_teacher_idx rename to class_offerings_teacher_idx;
alter table public.class_offerings
  rename constraint classes_id_school_unique to class_offerings_id_school_unique;
alter table public.class_offerings
  rename constraint classes_teacher_same_school to class_offerings_teacher_same_school;

alter policy "super admin manages classes" on public.class_offerings
  rename to "super admin manages class offerings";
alter policy "school members read classes" on public.class_offerings
  rename to "school members read class offerings";
alter policy "school members write classes" on public.class_offerings
  rename to "school members write class offerings";
alter policy "student reads own class" on public.class_offerings
  rename to "student reads own class offering";

comment on table public.class_offerings is
  'Renamed from classes (issue #571, map #568/#582). Each row is a specific '
  'Academic Year + Class + optional Group + optional Shift + optional Section '
  '-- the "Class Offering" concept. Ids preserved from the pre-rename classes '
  'table; academic_year is nullable until Wave 6 (#591) backfills it, then '
  'tightened to not null. shift stays nullable permanently (#578).';

-- ---------------------------------------------------------------------------
-- routine_slots.class_id -> class_offering_id (#571's resolution names this
-- column explicitly: "routine_slots.class_offering_id"). No other class_id
-- FK is renamed here -- subjects.class_id, fee_structures.class_id,
-- exams.class_id, class_routines.class_id and class_syllabi.class_id all
-- keep their existing column name; they still resolve correctly against
-- class_offerings (a table rename doesn't touch column names on referencing
-- tables), and renaming them isn't something any ticket in #568/#569-#581
-- decided. Only routine_slots was named, so only routine_slots moves.
alter table public.routine_slots rename column class_id to class_offering_id;
alter index if exists routine_slots_class_idx rename to routine_slots_class_offering_idx;
alter table public.routine_slots
  rename constraint routine_slots_class_id_fkey to routine_slots_class_offering_id_fkey;
alter table public.routine_slots
  rename constraint routine_slots_class_id_day_of_week_period_key
  to routine_slots_class_offering_id_day_of_week_period_key;

-- ---------------------------------------------------------------------------
-- Trigger/view/function bodies containing a LITERAL `classes` table
-- reference. Postgres updates a renamed table's own indexes, FKs, and RLS
-- policies automatically, but it does NOT rewrite table names appearing as
-- plain text inside function or view bodies -- every one of these would
-- start raising "relation classes does not exist" the moment the rename
-- above applies. Recreated here, in the same migration, so the database is
-- never left in a broken intermediate state. Column references only change
-- where the column itself was renamed above (routine_slots.class_offering_id);
-- every other column keeps its existing name.

-- class_routines / class_syllabi tenancy guard (0029). new.class_id is
-- unchanged -- neither of those two tables' class_id columns was renamed.
create or replace function public.enforce_class_ref_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from class_offerings where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  return new;
end $$;

-- routine_slots tenancy guard (0025, superseded by 0028's fuller version).
-- new.class_offering_id reflects this migration's own column rename above.
create or replace function public.enforce_routine_slot_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from class_offerings where id = new.class_offering_id and school_id = new.school_id
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

-- Seat-plan generation (0059). exams.class_id is unchanged -- only the
-- lookup against the renamed table moves. The roster resolution below
-- (matching students by class_name/section text) is deliberately left
-- exactly as fragile as it already was: rewriting it to join through
-- student_enrollments belongs to Wave 4b/Wave 6 (#588/#591), once that
-- table is actually populated, not to this rename-only migration.
create or replace function public.generate_seat_plan_for(exam_ids uuid[], room_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.app_current_school_id();
  target exams%rowtype;
  cls class_offerings%rowtype;
  e uuid;
  room record;
  cursor_row record;
  free int;
  taken int;
  share int;
  exams_left int;
  span int;
  start_roll int;
  end_roll int;
  next_after int;
begin
  if exam_ids is null or array_length(exam_ids, 1) is null then
    raise exception 'no exams selected';
  end if;
  if room_ids is null or array_length(room_ids, 1) is null then
    raise exception 'no rooms selected';
  end if;

  create temp table _seat_rolls (exam_id uuid, pos int, roll int) on commit drop;
  create temp table _seat_cursor (exam_id uuid primary key, next_pos int, total int) on commit drop;

  foreach e in array exam_ids loop
    select * into target from exams where id = e for update;
    if not found then
      raise exception 'unknown exam';
    end if;
    if target.school_id is distinct from sid then
      raise exception 'exam not accessible';
    end if;
    if target.status <> 'open' then
      raise exception 'exam is closed';
    end if;
    if target.class_id is null then
      raise exception 'exam has no class set';
    end if;

    select * into cls from class_offerings where id = target.class_id;

    insert into _seat_rolls (exam_id, pos, roll)
    select e, row_number() over (order by roll_number), roll_number
    from students
    where school_id = sid
      and class_name = cls.name
      and ((cls.section is null and section is null) or section = cls.section)
      and roll_number is not null
      and archived_at is null;

    insert into _seat_cursor (exam_id, next_pos, total)
    select e, 1, count(*) from _seat_rolls where exam_id = e;
  end loop;

  -- Only the named exams are cleared: another exam's allocation in the same
  -- room survives a regeneration it was not part of.
  delete from exam_seat_plans where exam_id = any(exam_ids);

  for room in
    select r.id, r.capacity
    from rooms r
    join buildings b on b.id = r.building_id
    where r.id = any(room_ids) and r.school_id = sid and r.is_active
    order by b.name, r.name
  loop
    select count(*) into exams_left from _seat_cursor where next_pos <= total;
    exit when exams_left = 0;

    select coalesce(sum(roll_end - roll_start + 1), 0) into taken
    from exam_seat_plans
    where room_id = room.id and school_id = sid;

    free := room.capacity - taken;
    continue when free <= 0;

    share := greatest(1, free / exams_left);

    for cursor_row in select * from _seat_cursor where next_pos <= total order by exam_id loop
      exit when free <= 0;

      select roll into start_roll
      from _seat_rolls
      where exam_id = cursor_row.exam_id and pos = cursor_row.next_pos;

      select max(pos), max(roll) into next_after, end_roll
      from _seat_rolls
      where exam_id = cursor_row.exam_id
        and pos >= cursor_row.next_pos
        and roll - start_roll + 1 <= least(share, free);

      if next_after is null then
        continue;
      end if;

      span := end_roll - start_roll + 1;
      insert into exam_seat_plans (exam_id, school_id, room_id, roll_start, roll_end)
      values (cursor_row.exam_id, sid, room.id, start_roll, end_roll);

      free := free - span;
      update _seat_cursor set next_pos = next_after + 1 where exam_id = cursor_row.exam_id;
    end loop;
  end loop;

  drop table _seat_rolls;
  drop table _seat_cursor;
end $$;

-- Student-message tenancy guard (0148): a general question's subject_id is
-- checked against the class it belongs to.
create or replace function public.enforce_student_message_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from students where id = new.student_id;
  if v_school is null or v_school <> new.school_id then
    raise exception 'student does not belong to this school';
  end if;

  if new.publication_id is not null then
    select school_id into v_school from publications where id = new.publication_id;
    if v_school is null or v_school <> new.school_id then
      raise exception 'publication does not belong to this school';
    end if;
  end if;

  if new.subject_id is not null then
    select c.school_id into v_school
      from subjects s left join class_offerings c on c.id = s.class_id
     where s.id = new.subject_id;
    if v_school is not null and v_school <> new.school_id then
      raise exception 'subject does not belong to this school';
    end if;
  end if;

  return new;
end $$;

-- Who to notify for a student message reply (0148).
create or replace function public.class_teacher_profile_for(
  p_school uuid, p_class text, p_section text
) returns uuid
language sql stable security definer set search_path = public as $$
  select e.profile_id
    from class_offerings c
    join employees e on e.id = c.class_teacher_id
   where c.school_id = p_school
     and c.name = p_class
     and coalesce(c.section, '') = coalesce(p_section, '')
   limit 1
$$;

-- Subject picker for a Student's general question (0148).
create or replace view public.student_subject_option
  with (security_invoker = off, security_barrier = true) as
  select distinct s.id, s.name
    from public.subjects s
    join public.class_offerings c on c.id = s.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '');

-- Fee structure tenancy guard (0039). fee_structures.class_id unchanged.
create or replace function public.enforce_fee_structure_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from class_offerings where id = new.class_id and school_id = new.school_id
  ) then
    raise exception 'class does not belong to this school';
  end if;
  return new;
end $$;

-- Exam-combination tenancy guard (0049). exam_combinations.class_id unchanged.
create or replace function public.enforce_exam_combination_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and not exists (
    select 1 from class_offerings where id = new.class_id and school_id = new.school_id
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

-- Exam basic-info tenancy guard (0044). exams.class_id unchanged. Note:
-- this is a DIFFERENT function from enforce_exam_seat_plan_school (also
-- 0044, but redefined by 0059 with no classes reference left in it -- no
-- action needed there) and from generate_seat_plan (redefined by 0059's
-- generate_seat_plan_for/generate_seat_plan pair, already recreated above).
create or replace function public.enforce_exam_refs_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null and not exists (
    select 1 from class_offerings where id = new.class_id and school_id = new.school_id
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

-- ---------------------------------------------------------------------------
-- ADR 0018/0021's class-capacity walk (0152, 0163). These are the exact
-- functions #569's resolution names as the ones Wave 2 (#585) will REDESIGN
-- to join through student_enrollments instead of matching class_name/section
-- by text -- that semantic rewrite is deliberately NOT done here. But their
-- CURRENT bodies contain literal `classes`/`routine_slots.class_id` text that
-- breaks the instant the rename above applies, and they gate RLS reads far
-- beyond Enrollment (students, student_subjects, behaviour_log_entries,
-- student_messages, student_profile_change_requests, and now
-- student_enrollments' own read policy in 0177) -- leaving them broken between
-- Wave 1 and Wave 2 is not an option. Table/column names only; every branch,
-- comment-worthy edge case, and the bool_or aggregation stay byte-for-byte
-- the same as 0152/0163 left them, so Wave 2's redesign has a single,
-- unambiguous body to replace rather than two divergent copies.
create or replace function public.staff_class_capacity_for_student(p_student uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner' then (
      select 'owner' from students s
       where s.id = p_student and s.school_id = public.app_current_school_id()
    )
    when public.app_current_employee_id() is null then null
    else (
      select case
               when bool_or(c.class_teacher_id = public.app_current_employee_id())
                 then 'class_teacher'
               when bool_or(exists (
                      select 1 from routine_slots r
                       where r.class_offering_id = c.id
                         and r.teacher_id = public.app_current_employee_id()
                    ))
                 then 'subject_teacher'
             end
        from students s
        join class_offerings c
          on c.school_id = s.school_id
         and c.name = s.class_name
         and coalesce(c.section, '') = coalesce(s.section, '')
       where s.id = p_student
         and s.school_id = public.app_current_school_id()
    )
  end
$$;

create or replace function public.staff_reaches_any_class()
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then false
    when public.app_current_role() = 'school_owner' then true
    when public.app_current_employee_id() is null then false
    else exists (
      select 1 from class_offerings c
       where c.school_id = public.app_current_school_id()
         and (
           c.class_teacher_id = public.app_current_employee_id()
           or exists (
             select 1 from routine_slots r
              where r.class_offering_id = c.id
                and r.teacher_id = public.app_current_employee_id()
           )
         )
    )
  end
$$;

-- 0163's class-coordinate variant (WITH CHECK needs the NEW row's class
-- before a row exists to look up by id).
create or replace function public.staff_capacity_for_class(p_school uuid, p_class text, p_section text)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner'
      then case when p_school = public.app_current_school_id() then 'owner' end
    when public.app_current_employee_id() is null then null
    else (
      select case
               when bool_or(c.class_teacher_id = public.app_current_employee_id()) then 'class_teacher'
               when bool_or(exists (
                      select 1 from routine_slots r
                       where r.class_offering_id = c.id and r.teacher_id = public.app_current_employee_id()
                    )) then 'subject_teacher'
             end
        from class_offerings c
       where c.school_id = p_school
         and c.name = p_class
         and coalesce(c.section, '') = coalesce(p_section, '')
    )
  end
$$;
