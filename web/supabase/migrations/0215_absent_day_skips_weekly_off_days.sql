-- 0215_absent_day_skips_weekly_off_days.sql
-- Issue #703 items 4.0 and 4.4.
-- DRAFT: written by an agent, applied by hand after review. Two functions, no
-- data change, no policy change, no table change. Safe to run twice.
--
-- WHAT
--   1. is_absent_working_day(sid, school, d): a day whose weekday is one of the
--      School's Weekly Off-Days (schools.weekly_off_days, 0206) is no longer an
--      absent working day. Every earlier condition is kept as it was.
--   2. student_class_attendance_days(p_start, p_end): new. A Student learns on
--      which days attendance was taken for their own class.
--
-- WHY
--   1. (#703 item 4.0) schools.weekly_off_days arrived in 0206 and the owner's
--      screens (lib/attendance-manual.ts dayOffInfo) honour it, but this
--      function, last written in 0046, was never told. Every Friday/Saturday
--      therefore counted as an absence for every Student: a Student present on
--      2 of 3 working days showed 40%, not 67%, and the same count feeds the
--      absent fine and the absence SMS.
--   2. (#703 item 4.4) A Student reads only their own attendance_records rows
--      (0146), so the portal cannot tell "the school took no attendance this
--      month" from "I was absent every day it was taken". Both show "—".
--
-- THE WEEKLY OFF-DAY RULE (the same one the app uses)
--   * Weekday numbering: 0 = Sunday .. 6 = Saturday. Postgres extract(dow) and
--     JS Date.getUTCDay() agree, and 0206 stores that convention.
--   * The weekday is the weekday of the calendar date `d` itself. `d` is a
--     date, not an instant, so no time zone takes part (dayOffInfo does the
--     same: it builds the date at UTC midnight and reads getUTCDay()).
--   * NULL weekly_off_days is read as {6} (Saturday), as getSchoolContext does
--     (lib/school/context.ts: `school?.weekly_off_days ?? [6]`). The column is
--     NOT NULL DEFAULT '{6}', so this is a guard, not a live case.
--   * An EMPTY array means the School has no weekly off-day: nothing is skipped.
--   * A School id with no schools row skips nothing (as before this change).
--   * A day with an attendance record is still never absent, off-day or not.
--
-- CALLERS WHOSE NUMBERS CHANGE (weekly off-days stop counting as absences)
--   SQL
--     absence_sms_candidates(text, date)            0046  anchor day only, see NOTE
--     absent_working_days_in_month(uuid, int, int)  0039  absent-fine day count
--     absent_working_days_in_range(uuid, date, date) 0146 progress report, portal
--     student_absent_working_days(date, date)       0146  student portal
--   App
--     app/api/sms/absence/route.ts            daily absence-SMS cron
--     app/school/fees/actions.ts              calculateAbsentFine (fee form button)
--     lib/progress-report-data.ts             progress report Attendance %
--     app/student/page.tsx                    student home, attendance this month
--     app/student/attendance/page.tsx         student attendance page
--   Stored values do NOT change by themselves: a fine already saved on a fee
--   record and an SMS already sent (sms_log) were computed with the old rule.
--
-- NOTE, NOT FIXED HERE: absence_sms_candidates walks the streak backwards with
--   its own inline copy of the off-day and leave conditions (0046, lines
--   170-186) and does not call this function for earlier days. After this
--   migration no SMS is raised ON a weekly off-day, but a streak that spans a
--   weekend still counts the Friday and Saturday (Thu + Sun absent reads as a
--   streak of 4, not 2). That function needs the same clause in its walk; it
--   changes which SMS rule matches, so it is left for its own reviewed change.
--
-- "ATTENDANCE WAS TAKEN FOR MY CLASS ON DAY D" (function 2)
--   There is no table that says a roll call happened: attendance_records holds
--   one row per person per day they were PRESENT and nothing for an absence
--   (0017, 0046). So the only evidence the schema has is: at least one Student
--   whose current Enrollment is in the same Class Offering as the caller's has
--   an attendance record on D. That is the definition used.
--   Returned are those days that also count for the caller: a day the caller
--   has a record, or a day is_absent_working_day says is an absence. A taken
--   day that is an off-day, a Weekly Off-Day or inside the caller's approved
--   leave, with no record of their own, is left out. So for the caller
--     returned days minus own present days = days absent while the class was marked
--   and that set is always inside what is_absent_working_day counts.
--   Limits, by design of the data:
--     * A day the whole class was absent (or the machine was down and nobody
--       marked by hand) looks the same as a day attendance was not taken.
--     * "Same class" is the classmates' CURRENT Enrollment, not the Enrollment
--       they held on D. After a promotion, older months are judged by today's
--       classmates.
--     * A Student with no current Enrollment gets no rows; the app then keeps
--       its previous behaviour.
--   Only dates are returned. No other Student's id, name or count leaves the
--   function.
--
-- ROLLBACK (run as written; restores the 0046 body and removes function 2)
--   create or replace function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
--   language sql stable security definer set search_path = public as $$
--     select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
--       and not exists (
--         select 1 from student_leaves l
--         where l.student_id = sid and l.status = 'approved' and d between l.from_day and l.to_day
--       )
--       and not exists (
--         select 1 from attendance_records ar
--         where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
--       )
--   $$;
--   drop function if exists public.student_class_attendance_days(date, date);
--   The app needs no change after a rollback: it treats the missing function
--   as "not available" (lib/student/attendance-source.ts).

-- ---------------------------------------------------------------------------
-- 1. Same signature, language, volatility, definer and search_path as 0046.
-- No grant or revoke: create or replace keeps the function's existing
-- privileges, which no migration has ever narrowed (0021 created it with the
-- default grants and nothing since has touched them).
create or replace function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
    and not exists (
      select 1 from schools sc
      where sc.id = school
        and extract(dow from d)::int = any (coalesce(sc.weekly_off_days, '{6}'::smallint[]))
    )
    and not exists (
      select 1 from student_leaves l
      where l.student_id = sid and l.status = 'approved' and d between l.from_day and l.to_day
    )
    and not exists (
      select 1 from attendance_records ar
      where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
    )
$$;

-- ---------------------------------------------------------------------------
-- 2. The days attendance was taken for the caller's class.
--
-- Definer, because a Student has no select policy on students or
-- student_enrollments and reads only their own attendance_records rows. The
-- caller is fixed inside the function by app_current_student_id() (null for
-- anyone who is not an active Student, so they get no rows); there is no
-- student or class argument to pass.
create or replace function public.student_class_attendance_days(p_start date, p_end date)
returns setof date
language sql stable security definer set search_path = public as $$
  with me as (
    select s.id, s.school_id, e.class_offering_id
      from students s
      join student_enrollments e on e.id = s.current_enrollment_id
     where s.id = public.app_current_student_id()
  ),
  taken as (
    select distinct ar.att_date as att_day
      from me
      join student_enrollments ce on ce.class_offering_id = me.class_offering_id
      join students c on c.current_enrollment_id = ce.id and c.school_id = me.school_id
      join attendance_records ar
        on ar.person_type = 'student'
       and ar.person_id = c.id
       and ar.school_id = me.school_id
       and ar.att_date between p_start and p_end
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

revoke execute on function public.student_class_attendance_days(date, date) from public, anon;
grant execute on function public.student_class_attendance_days(date, date) to authenticated;

comment on function public.student_class_attendance_days(date, date) is
  'Days in [p_start, p_end] on which attendance was taken for the calling '
  'Student''s class: some Student currently enrolled in the same Class Offering '
  'has an attendance record that day. Days excused for the caller (off-day, '
  'Weekly Off-Day, approved leave) are left out unless the caller has a record. '
  'Dates only. Issue #703 item 4.4.';
