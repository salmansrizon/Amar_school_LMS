-- Extend the demo school for everything map #91 added (issue #103).
--
-- Every surface this map introduced lands empty on Adarsha Model School
-- (Demo), so each new screen would demo as a blank state. This fills them:
-- print header data, two buildings with rooms, a full exam routine, a second
-- exam, a mixed-seating seat plan across both, and the recommended section
-- naming that replaces Shift.
--
-- Idempotent: fixed UUIDs + ON CONFLICT guards, same discipline as 0054.
-- All rows carry explicit school_id — app_current_school_id() is null under
-- service-role SQL.

-- ---------------------------------------------------------------------------
-- New fixed identifiers
-- ---------------------------------------------------------------------------
-- building main    dab00000-0000-4000-a000-000000000310  (renamed from auto-created)
-- building science dab00000-0000-4000-a000-000000000311
-- rooms            dab00000-0000-4000-a000-00000000030{4..6}
-- exam two         dab00000-0000-4000-a000-000000000041

-- ===========================================================================
-- 1. Institution profile for the print header (#92)
-- ===========================================================================
update schools set
  address_line = 'ঝিকরগাছা বাজার সড়ক, ঝিকরগাছা, যশোর - ৭৪২০',
  mobile = '01711-000000',
  email = 'info@adarsha-demo.edu.bd',
  center_code = 'CEN-4210'
where id = 'dab00000-0000-4000-a000-000000000001';

-- The logo itself is Storage bytes, which SQL cannot seed: it was uploaded on
-- this database through the owner's own upload path (the same client-direct
-- flow a school uses) and `schools.logo_path` set from there. A rebuilt
-- environment uploads it once from /school/institute — deliberately not
-- stamped into logo_path here, since a path with no object behind it would
-- print a broken image on every document.

-- Admit-card palette (#94) — so the colour affordance demos as chosen, not
-- as the plain default.
insert into school_print_themes (school_id, doc_type, palette_key)
values ('dab00000-0000-4000-a000-000000000001', 'admit-card', 'slate')
on conflict (school_id, doc_type) do update set palette_key = excluded.palette_key;

-- ===========================================================================
-- 2. Two buildings with realistic rooms (#93)
-- ===========================================================================
-- 0057 auto-created a "Main Building" per school and attached the existing
-- demo rooms to it; give it the demo's own identity rather than a second one.
update buildings set name = 'Academic Building'
where school_id = 'dab00000-0000-4000-a000-000000000001' and name = 'Main Building';

insert into buildings (id, school_id, name) values
  ('dab00000-0000-4000-a000-000000000311', 'dab00000-0000-4000-a000-000000000001', 'Science Block')
on conflict (id) do nothing;

insert into rooms (id, school_id, building_id, name, capacity, is_active) values
  ('dab00000-0000-4000-a000-000000000304', 'dab00000-0000-4000-a000-000000000001',
   'dab00000-0000-4000-a000-000000000311', 'Lab-1', 24, true),
  ('dab00000-0000-4000-a000-000000000305', 'dab00000-0000-4000-a000-000000000001',
   'dab00000-0000-4000-a000-000000000311', 'Lab-2', 24, true),
  ('dab00000-0000-4000-a000-000000000306', 'dab00000-0000-4000-a000-000000000001',
   'dab00000-0000-4000-a000-000000000311', 'Room 201', 30, true)
on conflict (id) do nothing;

-- ===========================================================================
-- 3. Sections renamed to the convention that replaces Shift (#100)
-- ===========================================================================
-- Grilling decision 4: no shift backfill — a school that wants the morning/day
-- distinction encodes it in the section name. The demo models that so the
-- pattern is visible to a stakeholder rather than described.
do $$
declare
  sch uuid := 'dab00000-0000-4000-a000-000000000001';
  ren record;
begin
  for ren in
    select * from (values
      ('Six',   'A', 'Morning - A'),
      ('Seven', 'A', 'Morning - A'),
      ('Eight', 'A', 'Day - A'),
      ('Nine',  'A', 'Morning - A'),
      ('Nine',  'B', 'Day - B'),
      ('Ten',   'A', 'Day - C')
    ) as t(cls, old_section, new_section)
  loop
    -- Students carry class_name/section as text, so both sides move together
    -- or the roster stops matching its class.
    update students set section = ren.new_section
    where school_id = sch and class_name = ren.cls and section = ren.old_section;

    update classes set section = ren.new_section
    where school_id = sch and name = ren.cls and section = ren.old_section;
  end loop;
end $$;

-- ===========================================================================
-- 4. A second open exam, so seat plans can mix two exams in one room (#95)
-- ===========================================================================
insert into exams (id, school_id, name, exam_year, status, class_id, start_date, grading_scheme_id)
values ('dab00000-0000-4000-a000-000000000041', 'dab00000-0000-4000-a000-000000000001',
        'First Term Examination (Class Nine)', 2026, 'open',
        'dab00000-0000-4000-a000-000000000204', date '2026-04-10',
        'dab00000-0000-4000-a000-000000000030')
on conflict (id) do nothing;

-- ===========================================================================
-- 5. Full exam routine for both exams (#97, #98)
-- ===========================================================================
-- Subject / date / start / end per sitting — what the routine print and the
-- room-wise attendance sheets both read.
insert into exam_routine_entries (exam_id, school_id, subject_id, exam_date, start_time, end_time, room_id)
select e.exam_id, 'dab00000-0000-4000-a000-000000000001', e.subject_id,
       e.exam_date::date, e.starts::time, e.ends::time, e.room_id::uuid
from (values
  ('dab00000-0000-4000-a000-000000000040'::uuid, 'dab00000-0000-4000-a000-000000000101'::uuid,
   '2026-04-10', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000301'),
  ('dab00000-0000-4000-a000-000000000040', 'dab00000-0000-4000-a000-000000000102',
   '2026-04-12', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000301'),
  ('dab00000-0000-4000-a000-000000000040', 'dab00000-0000-4000-a000-000000000103',
   '2026-04-14', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000301'),
  ('dab00000-0000-4000-a000-000000000040', 'dab00000-0000-4000-a000-000000000104',
   '2026-04-16', '10:00', '12:30', 'dab00000-0000-4000-a000-000000000304'),
  ('dab00000-0000-4000-a000-000000000040', 'dab00000-0000-4000-a000-000000000105',
   '2026-04-18', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000301'),
  ('dab00000-0000-4000-a000-000000000041', 'dab00000-0000-4000-a000-000000000101',
   '2026-04-10', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000306'),
  ('dab00000-0000-4000-a000-000000000041', 'dab00000-0000-4000-a000-000000000102',
   '2026-04-12', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000306'),
  ('dab00000-0000-4000-a000-000000000041', 'dab00000-0000-4000-a000-000000000103',
   '2026-04-14', '10:00', '13:00', 'dab00000-0000-4000-a000-000000000306')
) as e(exam_id, subject_id, exam_date, starts, ends, room_id)
where not exists (
  select 1 from exam_routine_entries r
  where r.exam_id = e.exam_id and r.subject_id = e.subject_id and r.exam_date = e.exam_date::date
);

-- ===========================================================================
-- 6. Mixed-seating seat plan spanning both exams (#95, #96, #97)
-- ===========================================================================
-- generate_seat_plan_for reads app_current_school_id(), which is null under
-- service-role SQL, so the allocation is written directly — the same shape
-- the RPC produces: consecutive roll ranges per room, two exams sharing
-- Room 101, capacity respected across both.
do $$
declare
  sch uuid := 'dab00000-0000-4000-a000-000000000001';
  ten_exam uuid := 'dab00000-0000-4000-a000-000000000040';
  nine_exam uuid := 'dab00000-0000-4000-a000-000000000041';
  room_101 uuid := 'dab00000-0000-4000-a000-000000000301';
  room_201 uuid := 'dab00000-0000-4000-a000-000000000306';
  ten_lo int; ten_hi int; nine_lo int; nine_hi int;
begin
  -- Replace whatever the demo exams were holding: the walkthrough wants the
  -- mixed arrangement specifically, and re-running must land the same state.
  delete from exam_seat_plans where exam_id in (ten_exam, nine_exam);

  select min(roll_number), max(roll_number) into ten_lo, ten_hi
  from students
  where school_id = sch and class_name = 'Ten' and roll_number is not null and archived_at is null;

  select min(roll_number), max(roll_number) into nine_lo, nine_hi
  from students
  where school_id = sch and class_name = 'Nine' and section = 'Morning - A'
    and roll_number is not null and archived_at is null;

  if ten_lo is null or nine_lo is null then
    raise notice 'demo rosters missing rolls; skipping seat plan';
    return;
  end if;

  -- Both exams in Room 101: the standard anti-cheating arrangement, and the
  -- case the notice-board print's combined roll list exists for.
  insert into exam_seat_plans (exam_id, school_id, room_id, roll_start, roll_end)
  values (ten_exam, sch, room_101, ten_lo, ten_hi),
         (nine_exam, sch, room_101, nine_lo, nine_hi)
  on conflict do nothing;

  -- Room 201 carries the Class Nine sitting on its own, so the demo shows a
  -- single-exam room next to a mixed one.
  insert into exam_seat_plans (exam_id, school_id, room_id, roll_start, roll_end)
  values (nine_exam, sch, room_201, nine_lo, nine_hi)
  on conflict do nothing;
end $$;
