-- 0251_class_attendance_days_range_and_archived.sql
-- Issue #703 item 4.7.
-- DRAFT: written by an agent, applied by hand after review. One function
-- replaced, no data change, no policy change, no table change. Safe to run
-- twice. 0218 is not edited; this replaces the function 0218 creates.
--
-- WHAT
--   student_class_attendance_days(p_start, p_end), two narrowings:
--   1. A range longer than 366 days (p_end - p_start > 366), or a reversed
--      range, returns no rows.
--   2. An archived classmate (students.archived_at is not null) no longer makes
--      a day count as "attendance was taken for my class".
--   Everything else is the 0218 body, line for line.
--
-- WHY
--   Found by the review of 0218: a Student could ask for any range, including
--   years before they joined, and a classmate archived since still counted as
--   "the class was marked that day".
--
-- CHOICES
--   * 366, not 365, so a whole leap year (1 Jan .. 31 Dec) is one valid call.
--   * No rows instead of an error: the app treats an empty list as "no taken
--     days known" and keeps its pre-0218 figures (lib/student/attendance.ts
--     attendanceOutcome). The pages only ever ask for one month.
--   * The caller's own archive state is already covered:
--     app_current_student_id() is null for a Student who is not active.
--
-- WHO MAY READ WHAT (unchanged from 0218)
--   Definer. The Student is fixed inside by app_current_student_id(); there is
--   no student or class argument. Only dates are returned.
--
-- EFFECT ON EXISTING DATA
--   None stored. A day on which ONLY since-archived classmates were marked
--   stops being a "taken" day, so for that day the Student is no longer shown
--   absent. Expected to be rare.
--
-- PREREQUISITE
--   0218 applied (this file also works without it: it then creates the
--   function, and needs is_absent_working_day, which exists since 0021).
--
-- PRE-CHECK (read-only)
--   -- 1. The function exists with 0218's privileges (expect f, t):
--   select has_function_privilege('anon', 'public.student_class_attendance_days(date, date)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.student_class_attendance_days(date, date)', 'execute') as authed;
--   -- 2. How many (class, day) pairs are "taken" only through archived Students
--   --    (these stop counting). Expect few or none.
--   with marks as (
--     select ar.person_id, ar.att_date from attendance_records ar where ar.person_type = 'student'
--     union
--     select an.person_id, an.att_date from attendance_absence_notes an where an.person_type = 'student'
--   )
--   select count(*) from (
--     select e.class_offering_id, m.att_date
--       from marks m
--       join students s on s.id = m.person_id
--       join student_enrollments e on e.id = s.current_enrollment_id
--      group by 1, 2
--     having bool_and(s.archived_at is not null)
--   ) only_archived;
--
-- ROLLBACK (restores the 0218 body; privileges and comment stay)
--   create or replace function public.student_class_attendance_days(p_start date, p_end date)
--   returns setof date
--   language sql stable security definer set search_path = public as $$
--     with me as (
--       select s.id, s.school_id, e.class_offering_id
--         from students s
--         join student_enrollments e on e.id = s.current_enrollment_id
--        where s.id = public.app_current_student_id()
--     ),
--     classmates as (
--       select c.id, me.school_id
--         from me
--         join student_enrollments ce on ce.class_offering_id = me.class_offering_id
--         join students c on c.current_enrollment_id = ce.id and c.school_id = me.school_id
--     ),
--     taken as (
--       select ar.att_date as att_day
--         from classmates cm
--         join attendance_records ar
--           on ar.person_type = 'student' and ar.person_id = cm.id
--          and ar.school_id = cm.school_id and ar.att_date between p_start and p_end
--       union
--       select an.att_date
--         from classmates cm
--         join attendance_absence_notes an
--           on an.person_type = 'student' and an.person_id = cm.id
--          and an.school_id = cm.school_id and an.att_date between p_start and p_end
--     )
--     select t.att_day
--       from taken t
--      cross join me
--      where exists (
--              select 1 from attendance_records mine
--               where mine.person_type = 'student' and mine.person_id = me.id and mine.att_date = t.att_day
--            )
--         or public.is_absent_working_day(me.id, me.school_id, t.att_day)
--      order by t.att_day
--   $$;

create or replace function public.student_class_attendance_days(p_start date, p_end date)
returns setof date
language sql stable security definer set search_path = public as $$
  with me as (
    select s.id, s.school_id, e.class_offering_id
      from students s
      join student_enrollments e on e.id = s.current_enrollment_id
     where s.id = public.app_current_student_id()
       -- #703 item 4.7: at most one year per call, and not reversed.
       and p_end >= p_start
       and p_end - p_start <= 366
  ),
  classmates as (
    select c.id, me.school_id
      from me
      join student_enrollments ce on ce.class_offering_id = me.class_offering_id
      join students c on c.current_enrollment_id = ce.id and c.school_id = me.school_id
     -- #703 item 4.7: an archived classmate does not make a day "taken".
     where c.archived_at is null
  ),
  taken as (
    select ar.att_date as att_day
      from classmates cm
      join attendance_records ar
        on ar.person_type = 'student'
       and ar.person_id = cm.id
       and ar.school_id = cm.school_id
       and ar.att_date between p_start and p_end
    union
    select an.att_date
      from classmates cm
      join attendance_absence_notes an
        on an.person_type = 'student'
       and an.person_id = cm.id
       and an.school_id = cm.school_id
       and an.att_date between p_start and p_end
  )
  select t.att_day
    from taken t
   cross join me
   where exists (
           select 1 from attendance_records mine
            where mine.person_type = 'student' and mine.person_id = me.id and mine.att_date = t.att_day
         )
      or public.is_absent_working_day(me.id, me.school_id, t.att_day)
   order by t.att_day
$$;

-- Restated so the file is complete on its own (0218 sets the same).
revoke execute on function public.student_class_attendance_days(date, date) from public, anon;
grant execute on function public.student_class_attendance_days(date, date) to authenticated;

notify pgrst, 'reload schema';
