-- 0145_student_exam_schedule.sql
-- Map #434 / ticket #450: the exam side of a Student's calendar.
--
-- Two definer views again, and for the same reason as student_routine: both
-- reads are only ever wanted fully resolved (subject name, room name), and
-- resolving them here means a Student needs no grant on exams, subjects, rooms,
-- exam_routine_entries or exam_seat_plans.

-- ---------------------------------------------------------------------------
-- 1. The exam routine.
--
-- Scoped to exams for the Student's own class. There is no publish marker on
-- the routine itself — `exams.status` and the seat-plan stamp are the only
-- gates in this area — so a scheduled exam is visible as soon as its dates are
-- entered, which matches what the school's own routine screen shows.
--
-- day_of_week is derived, not stored, exactly as the existing screen does it.
drop view if exists public.student_exam_routine;
create view public.student_exam_routine with (security_invoker = off, security_barrier = true) as
  select e.id            as exam_id,
         e.name          as exam_name,
         e.exam_year,
         r.exam_date,
         extract(dow from r.exam_date)::int as day_of_week,
         r.start_time,
         r.end_time,
         sub.name        as subject_name,
         rm.name         as room_name
    from public.exam_routine_entries r
    join public.exams e on e.id = r.exam_id
    join public.classes c on c.id = e.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '')
    left join public.subjects sub on sub.id = r.subject_id
    left join public.rooms rm on rm.id = r.room_id;

grant select on public.student_exam_routine to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The Student's own seat.
--
-- exam_seat_plans rows are room + roll RANGE. Showing a Student the raw ranges
-- would make them work out where they sit; this resolves their own roll into
-- the one room that contains it, which is the only row that concerns them.
--
-- Published only. `exams.seat_plan_published_at` is the gate, and 0045 already
-- clears that stamp whenever the plan is edited — so an in-progress re-seating
-- disappears from the Student's view until the school publishes again, rather
-- than sending them to a room they have been moved out of.
drop view if exists public.student_seat_assignment;
create view public.student_seat_assignment with (security_invoker = off, security_barrier = true) as
  select e.id     as exam_id,
         e.name   as exam_name,
         e.exam_year,
         rm.name  as room_name,
         sp.roll_start,
         sp.roll_end,
         me.roll_number
    from public.exam_seat_plans sp
    join public.exams e on e.id = sp.exam_id
                       and e.seat_plan_published_at is not null
    join public.classes c on c.id = e.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '')
     and me.roll_number between sp.roll_start and sp.roll_end
    left join public.rooms rm on rm.id = sp.room_id;

grant select on public.student_seat_assignment to authenticated;
