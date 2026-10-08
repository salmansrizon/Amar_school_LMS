-- 0261_student_attendance_summary_since.sql
-- Owner's decision 2026-10-09: the attendance mark page shows each Student's
-- attendance for THIS MONTH so far, not for the Academic Year.
-- WRITTEN, NOT APPLIED. The app works with and without it: until it is applied
-- the mark page keeps the yearly figure and the yearly label.
--
-- What: student_attendance_summary_since(p_from date). The same count as
--   student_attendance_summary() (0217), with the window starting at p_from
--   instead of 1 January:
--     window      = greatest(p_from, the day the Student's current Enrollment
--                   was created) .. today (Asia/Dhaka)
--     present_days = the Student's attendance records in that window
--     school_days  = distinct days on which the Student's School has at least
--                    one student attendance record, in that window
--   A new function, not a changed one: 0217's function keeps its meaning (the
--   Attendance Rate of CONTEXT.md is the Academic Year so far) and its callers.
--   A NULL or future p_from returns zero days for everyone.
-- Security: SECURITY INVOKER, like 0217. Row level security decides which
--   Students and records the caller sees; it grants nobody anything new.
--   EXECUTE for authenticated only.
-- Effect on existing data: none. No table, row, policy or existing function changes.
--
-- PRE-CHECK (read-only)
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('student_attendance_summary', 'student_attendance_summary_since');
--   -- expect one row: student_attendance_summary
--
-- Rollback
--   drop function if exists public.student_attendance_summary_since(date);
--   notify pgrst, 'reload schema';
-- Idempotent.

create or replace function public.student_attendance_summary_since(p_from date)
returns table (student_id uuid, present_days bigint, school_days bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (now() at time zone 'Asia/Dhaka')::date as today
  ),
  win as (
    select s.id, s.school_id, b.today,
           greatest(
             p_from,
             coalesce((se.created_at at time zone 'Asia/Dhaka')::date, p_from)
           ) as from_day
      from students s
     cross join bounds b
      left join student_enrollments se on se.id = s.current_enrollment_id
  ),
  days as materialized (
    select distinct ar.school_id, ar.att_date
      from attendance_records ar, bounds b
     where ar.person_type = 'student'
       and ar.att_date between p_from and b.today
  )
  select w.id,
         (select count(*) from attendance_records ar
           where ar.person_type = 'student'
             and ar.person_id = w.id
             and ar.att_date between w.from_day and w.today),
         (select count(*) from days d
           where d.school_id = w.school_id
             and d.att_date between w.from_day and w.today)
    from win w
$$;

revoke execute on function public.student_attendance_summary_since(date) from anon, public;
grant execute on function public.student_attendance_summary_since(date) to authenticated;

notify pgrst, 'reload schema';
