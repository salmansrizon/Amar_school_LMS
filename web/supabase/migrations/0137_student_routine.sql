-- 0137_student_routine.sql
-- Map #434 / ticket #444: a Student sees their own class routine.
--
-- The whole read is ONE definer view rather than student policies on
-- routine_slots, subjects, employees and rooms. A routine row is only ever
-- wanted fully resolved — subject name, teacher name, room name — so resolving
-- it behind one interface means a Student needs no grant on any of those four
-- tables. In particular it keeps `employees` shut: a Student has no business
-- reading the HR record, and here they never touch it.

-- ---------------------------------------------------------------------------
-- Published only. class_routines is the per-class publish marker (0025): an
-- absent row, or a null published_at, means the school is still drafting. A
-- draft routine must not reach a Student, for the same reason unreleased exam
-- marks must not (#440) — it is working material, not an announcement.
drop view if exists public.student_routine;
create view public.student_routine with (security_invoker = off, security_barrier = true) as
  select rs.day_of_week,
         rs.period,
         sub.name  as subject_name,
         emp.full_name as teacher_name,
         rm.name   as room_name
    from public.routine_slots rs
    join public.class_routines cr
      on cr.class_id = rs.class_id and cr.published_at is not null
    join public.classes c
      on c.id = rs.class_id
    join public.students me
      on me.profile_id = auth.uid()
     and me.archived_at is null
     and me.school_id = c.school_id
     and me.class_name = c.name
     and coalesce(me.section, '') = coalesce(c.section, '')
    left join public.subjects  sub on sub.id = rs.subject_id
    left join public.employees emp on emp.id = rs.teacher_id
    left join public.rooms     rm  on rm.id  = rs.room_id;

grant select on public.student_routine to authenticated;

-- ---------------------------------------------------------------------------
-- Off days, so "no classes today" can say WHY.
--
-- A Student seeing an empty Thursday should be told it is Eid, not left to
-- wonder whether the routine is broken. Both tables are calendars, not personal
-- data — the school's own closures and the national holidays.
drop policy if exists "student reads own school off days" on public.off_days;
create policy "student reads own school off days" on public.off_days
  for select using (school_id = public.app_current_student_school_id());

-- central_off_days was closed to students by 0133 along with the rest of the
-- `auth.uid() is not null` family. It is the national holiday calendar, so it
-- gets an explicit way back in rather than an exception in that rule.
drop policy if exists "student reads central off days" on public.central_off_days;
create policy "student reads central off days" on public.central_off_days
  for select using (public.app_is_student());
