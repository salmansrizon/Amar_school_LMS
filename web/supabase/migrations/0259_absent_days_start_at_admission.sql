-- 0259_absent_days_start_at_admission.sql
-- Issue #703 item 4.8.
-- WRITTEN, NOT APPLIED. One function replaced, no data change, no policy
-- change, no table change, no grant change. Safe to run twice.
--
-- WHAT
--   is_absent_working_day(sid, school, d): a day BEFORE the Student was
--   admitted is not an absent working day. Every earlier condition (off_days,
--   Weekly Off-Days, approved leave, an attendance record) is the 0218 body,
--   line for line.
--
-- WHY
--   A Student admitted on 8 October was shown absent on 4 and 5 October, and
--   on every working day back to the start of whatever range was asked for.
--   Absence is "no attendance record on a working day", and nothing said the
--   Student was not there yet. The same count feeds the absent fine, the
--   progress report and the Student's own pages.
--
-- THE RULE
--   Not absent when BOTH hold:
--     1. the Student has a current Enrollment (students.current_enrollment_id
--        is not null), and
--     2. d < the admission day
--          = (students.created_at at time zone 'Asia/Dhaka')::date
--   * The admission day itself still counts: a Student admitted on 8 October
--     with no record on 8 October is absent that day, as before.
--   * A Student with NO current Enrollment keeps today's behaviour exactly:
--     nothing is cut off for them.
--   * A day with an attendance record is never absent, as before. So a record
--     that exists before the admission day changes nothing.
--   * The time zone and the cast are the ones 0217 uses for its window
--     (Asia/Dhaka, as lib/school-time.ts).
--
-- WHY THE ADMISSION DAY AND NOT "THE CURRENT ENROLLMENT WAS CREATED" (0217)
--   0217 starts its Attendance Rate window at
--     (student_enrollments.created_at at time zone 'Asia/Dhaka')::date
--   of the CURRENT Enrollment. That was the definition asked for here, and
--   reading how Enrollment rows are made shows it is wrong for counting
--   absences:
--   * Every transition makes a NEW current Enrollment with created_at = now()
--     (0180 set_student_enrollment: promoted, repeated, transferred; called by
--     the transfer form and the promotion action). After a transfer on
--     15 October every absence of 1-14 October would stop counting; after the
--     promotion the absent fine of the month before would come out as 0 days.
--   * 0183 gave every Student who already existed one Enrollment created on
--     the day 0183 was applied. All their absences before that day would
--     vanish from the fine and from the progress report.
--   For a rate (0217) a later start only narrows both sides of a ratio. Here
--   it removes real absences from a count that is turned into money.
--   students.created_at does not move on a transition or a backfill, and for
--   a Student admitted through the app it is the same moment as their first
--   Enrollment (admitStudent inserts the row and calls
--   admit_student_enrollment in one action). For a Student admitted and never
--   moved since, the two definitions give the same day.
--   The literal 0217 definition, if it is wanted after all, is this one clause
--   in place of the new one (NOT recommended, for the reasons above):
--       and not exists (
--         select 1 from students s
--           join student_enrollments se on se.id = s.current_enrollment_id
--          where s.id = sid and d < (se.created_at at time zone 'Asia/Dhaka')::date
--       )
--
-- CALLERS WHOSE NUMBERS CHANGE (all through this one function)
--   Example School: Weekly Off-Days Friday + Saturday. Student admitted
--   Thursday 8 October 2026, present on every school day since. Working days
--   of October before the admission: Thu 1, Sun 4, Mon 5, Tue 6, Wed 7 = 5.
--   SQL
--     absent_working_days_in_month(uuid, int, int)    0039  absent fine
--         October: before 5, after 0. At 20 a day the suggested fine was 100.
--     absent_working_days_in_range(uuid, date, date)  0146  progress report
--         1 Jan .. 31 Oct: before, every working day from 1 January to
--         7 October (about 190) counted absent and the report's Attendance %
--         was near zero; after 0, and the % is taken over the days since 8 Oct.
--     student_absent_working_days(date, date)         0146  Student pages
--         October: before 5, after 0.
--     student_class_attendance_days(date, date)       0251  Student calendar
--         4 and 5 October (the class was marked) were returned and drawn as
--         absent; after, they are not returned.
--     absence_sms_candidates(text, date)              0250  absence SMS
--         ANCHOR day only: a run for a target date before the admission day no
--         longer lists the Student. The daily cron runs for today, and nobody
--         is admitted tomorrow, so the daily SMS does not change. See NOTE.
--   App (no code change; each reads one of the functions above)
--     app/school/fees/actions.ts        calculateAbsentFine (fee form button)
--     lib/progress-report-data.ts       progress report Attendance %
--     app/student/page.tsx              Student home, attendance this month
--     app/student/attendance/page.tsx   Student attendance page and calendar
--     app/api/sms/absence/route.ts      daily absence-SMS cron
--   Stored values do NOT change by themselves: a fine already saved on a fee
--   record and an SMS already sent were worked out with the old rule.
--   Numbers only ever go DOWN, and only for days before an admission day.
--
-- NOTE, NOT FIXED HERE: absence_sms_candidates measures the streak by walking
--   back from the target date with its own inline copy of the off-day and
--   leave conditions (0046 / 0250). It does not call this function for the
--   earlier days, so the walk does not stop at the admission day: a Student
--   admitted on Thursday 8 October and absent on Sunday 11 with no record on
--   the 8th gets a streak that runs back up to 60 days, and the wrong SMS rule
--   (or none) matches. That was so before this file and is so after it. The
--   walk needs the same clause in its `prev` filter:
--       and not exists (
--         select 1 from students s
--          where s.id = st.sid and s.current_enrollment_id is not null
--            and g.d::date < (s.created_at at time zone 'Asia/Dhaka')::date
--       )
--   It changes which SMS rule matches (the owner's yes, as for 0250) and it
--   replaces a function whose 0250 body may or may not be applied yet, so it
--   is left for its own reviewed change.
--
-- EFFECT ON EXISTING DATA
--   None. Nothing stored is read differently except through the functions
--   listed above.
--
-- PRIVILEGES
--   0245 (applied) revoked EXECUTE on this function from public, anon and
--   authenticated. `create or replace` keeps that. This file grants nothing.
--   Every caller is SECURITY DEFINER and runs it as the owner.
--
-- PREREQUISITE
--   0218 (the body this one extends) and 0178 (students.current_enrollment_id).
--
-- PRE-CHECK (read-only; run as the database owner, EXECUTE is revoked from
-- the API roles; keep the output)
--   -- 1. The body being replaced is the 0218 one (compare with ROLLBACK).
--   select pg_get_functiondef('public.is_absent_working_day(uuid, uuid, date)'::regprocedure);
--   -- 2. Privileges before, to compare afterwards (expect f, f after 0245).
--   select has_function_privilege('anon', 'public.is_absent_working_day(uuid, uuid, date)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.is_absent_working_day(uuid, uuid, date)', 'execute') as authed;
--   -- 3. How many Students have a marked class day before their admission
--   --    day this year, and how many such days: these are the absences that
--   --    stop counting. "Marked" = the School has a student attendance record
--   --    or a hand-marked absence that day.
--   with st as (
--     select s.id, s.school_id, (s.created_at at time zone 'Asia/Dhaka')::date as admitted
--       from students s
--      where s.current_enrollment_id is not null
--        and s.archived_at is null
--        and (s.created_at at time zone 'Asia/Dhaka')::date > date_trunc('year', current_date)::date
--   ), marked as (
--     select school_id, att_date from attendance_records
--      where person_type = 'student' and att_date >= date_trunc('year', current_date)::date
--     union
--     select school_id, att_date from attendance_absence_notes
--      where person_type = 'student' and att_date >= date_trunc('year', current_date)::date
--   )
--   select st.school_id,
--          count(distinct st.id) as students_affected,
--          count(*)              as absent_days_that_stop_counting
--     from st
--     join marked m on m.school_id = st.school_id and m.att_date < st.admitted
--    where public.is_absent_working_day(st.id, st.school_id, m.att_date)
--    group by st.school_id
--    order by 3 desc;
--   -- 4. Why the admission day and not the current Enrollment's: Students
--   --    whose current Enrollment was created on a later day than they were
--   --    admitted (moved, promoted or backfilled by 0183). With the 0217
--   --    definition each of them would lose the absences between the two days.
--   select s.school_id, count(*) as students_moved_or_backfilled
--     from students s
--     join student_enrollments se on se.id = s.current_enrollment_id
--    where (se.created_at at time zone 'Asia/Dhaka')::date > (s.created_at at time zone 'Asia/Dhaka')::date
--    group by s.school_id;
--
-- POST-CHECK (read-only)
--   -- Query 3 returns no rows. Query 2 still returns f, f.
--
-- ROLLBACK (run as written; restores the 0218 body, privileges stay)
--   create or replace function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
--   language sql stable security definer set search_path = public as $$
--     select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
--       and not exists (
--         select 1 from schools sc
--         where sc.id = school
--           and extract(dow from d)::int = any (coalesce(sc.weekly_off_days, '{6}'::smallint[]))
--       )
--       and not exists (
--         select 1 from student_leaves l
--         where l.student_id = sid and l.status = 'approved' and d between l.from_day and l.to_day
--       )
--       and not exists (
--         select 1 from attendance_records ar
--         where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
--       )
--   $$;
--   notify pgrst, 'reload schema';

-- Same signature, language, volatility, definer and search_path as 0218.
-- No grant and no revoke: see PRIVILEGES.
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
    -- #703 item 4.8: not absent before the admission day.
    and not exists (
      select 1 from students s
      where s.id = sid
        and s.current_enrollment_id is not null
        and d < (s.created_at at time zone 'Asia/Dhaka')::date
    )
$$;

notify pgrst, 'reload schema';
