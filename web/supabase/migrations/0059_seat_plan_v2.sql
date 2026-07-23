-- Seat plan v2 (issue #95, map #91, docs/improvement.md §2B): multiple exams,
-- multiple buildings, and mixed seating.
--
-- 0044's generate_seat_plan partitioned ONE exam's roster across ALL active
-- rooms, one roll-range per room, with `unique (exam_id, room_id)`. The doc
-- wants a selection of exams and a selection of buildings/rooms, and map #91
-- grilling decision 9 adds mixed seating: one room may hold students from
-- several exams at once — the standard anti-cheating arrangement.
--
-- What changes:
--   1. `unique (exam_id, room_id)` gives way to `(exam_id, room_id, roll_start)`
--      so one exam may occupy a room more than once, and several exams may
--      share a room.
--   2. The capacity trigger sums the allocated spans across ALL exams in the
--      room rather than checking a single range against capacity.
--   3. generate_seat_plan takes exam and room arrays; the single-exam
--      signature stays and delegates, so shipped callers keep working.
--
-- Deliberately NOT added: a parent "seat plan run" entity. `exam_seat_plans`
-- stays the store and the selection lives only in the generation call — a run
-- is not something a school revisits or names, and persisting one would add a
-- lifecycle (stale runs, re-runs, orphans) that nothing in the doc asks for.
-- Regeneration is scoped to the exams named in the call, so regenerating one
-- exam never disturbs another exam sharing the same rooms.

alter table public.exam_seat_plans
  drop constraint exam_seat_plans_exam_id_room_id_key;
alter table public.exam_seat_plans
  add constraint exam_seat_plans_exam_room_start_key unique (exam_id, room_id, roll_start);
create index exam_seat_plans_room_idx on public.exam_seat_plans (room_id);

-- Capacity is now a room-wide budget shared by every exam seated in it.
create or replace function public.enforce_exam_seat_plan_school() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  used int;
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

  -- Mixed seating (grilling decision 9): what the room already owes every
  -- other allocation, whichever exam it belongs to, plus what this row asks
  -- for, must fit. On update the row's own previous span is excluded.
  select coalesce(sum(roll_end - roll_start + 1), 0) into used
  from exam_seat_plans
  where room_id = new.room_id
    and school_id = new.school_id
    and id is distinct from new.id;

  if used + (new.roll_end - new.roll_start + 1) > cap then
    raise exception 'room capacity exceeded';
  end if;
  return new;
end $$;

-- Generate Seat Plan across a selection of exams and rooms.
--
-- Rooms are consumed in building-then-room name order. Each room's capacity is
-- shared among the exams that still have unplaced students, so exams interleave
-- across the venue instead of one exam filling a room before the next starts —
-- which is the point of mixed seating. Within an exam, students stay ordered by
-- roll and a room always receives a consecutive roll range (no per-desk seat
-- numbers: map #91 fog-grilling keeps the model range-based).
--
-- A room absorbs as many consecutive-by-roll students as fit within its
-- remaining capacity's RANGE SPAN, not raw headcount — preserved from 0044, so
-- a gappy roll sequence can never produce a range the capacity trigger rejects.
create or replace function public.generate_seat_plan_for(exam_ids uuid[], room_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.app_current_school_id();
  target exams%rowtype;
  cls classes%rowtype;
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

    select * into cls from classes where id = target.class_id;

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

    -- Seats an exam OUTSIDE this call already holds in the room. Those rows
    -- were deliberately not deleted, and the capacity trigger sums across every
    -- exam in the room — so budgeting from raw capacity would overfill the room
    -- and abort the whole run.
    select coalesce(sum(roll_end - roll_start + 1), 0) into taken
    from exam_seat_plans
    where room_id = room.id and school_id = sid;

    free := room.capacity - taken;
    continue when free <= 0;

    -- Every exam still in play gets a slice of what is actually left; at least
    -- one seat each, so no exam is starved out of a venue it belongs in.
    share := greatest(1, free / exams_left);

    for cursor_row in select * from _seat_cursor where next_pos <= total order by exam_id loop
      exit when free <= 0;

      select roll into start_roll
      from _seat_rolls
      where exam_id = cursor_row.exam_id and pos = cursor_row.next_pos;

      -- Longest consecutive run whose SPAN fits the smaller of this exam's
      -- slice and what the room has left.
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

revoke execute on function public.generate_seat_plan_for(uuid[], uuid[]) from anon, public;
grant execute on function public.generate_seat_plan_for(uuid[], uuid[]) to authenticated;

-- The shipped single-exam signature keeps working: one exam, every active room
-- in the school, exactly as before.
create or replace function public.generate_seat_plan(exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.app_current_school_id();
  rooms_all uuid[];
begin
  select array_agg(id) into rooms_all from rooms where school_id = sid and is_active;
  if rooms_all is null then
    -- No usable venue: clear the exam's plan and stop, matching 0044's
    -- "nothing to place" behaviour rather than raising.
    delete from exam_seat_plans where exam_id = exam;
    return;
  end if;
  perform public.generate_seat_plan_for(array[exam], rooms_all);
end $$;
