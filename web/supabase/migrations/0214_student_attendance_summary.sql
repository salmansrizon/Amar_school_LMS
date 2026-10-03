-- 0214_student_attendance_summary.sql
-- Map 013 (docs/013_owner_ui_overhaul_map.md), F7/P1 migration exception.
-- DRAFT: written by an agent, applied by hand after review. Additive only:
-- two new functions, nothing altered, nothing replaced, no policy touched.
--
-- Why: the Student directory shows each Student's Attendance Rate and the
-- dashboard a school-wide one. attendance_records (0017) holds only PRESENT
-- days (every status is a kind of present; absence is the missing row), one
-- per person per day. A school's year to date is ~270k rows, REST returns at
-- most 1,000 per request and aggregates are disabled, so app code cannot count
-- them. These functions count in the database and return one row per Student.
--
-- Definition (CONTEXT.md, "Attendance Rate"):
--   rate        = present_days / school_days
--   window      = greatest(1 January of this year, the day the Student's
--                 current Enrollment was created) .. today (Asia/Dhaka,
--                 matching lib/school-time.ts). No current Enrollment -> 1 Jan.
--   school_days = distinct att_date on which the Student's School has ANY
--                 student attendance record, inside that window.
--   Bands (app side, lib/dashboard.ts attendanceBand): >=90 Regular,
--   75-89 Irregular, <75 At risk.
--
-- Security: SECURITY INVOKER, deliberately. Every read goes through the
-- caller's existing RLS on students, student_enrollments and
-- attendance_records, unchanged:
--   * Owner / staff: students rows are their school's, narrowed by class
--     attachment (0163); attendance_records by school + Permission Grant
--     ('attendance' or 'exams', 0136). A staff user without either grant sees
--     no attendance rows, so gets present 0 / school 0, not someone else's data.
--   * Student: has NO select policy on students (0131), so zero rows. A Student
--     cannot read any rate here, their own included; the portal keeps using
--     student_absent_working_days (0146).
--   * Super admin: sees every school; school_days is computed per school_id,
--     so each Student is still measured against their own School's days.
-- No definer, so no explicit tenant predicate is needed and none can be
-- forgotten. Execute is revoked from anon/public and granted to authenticated.
--
-- Indexes: none added. present_days is a range scan on the existing unique
-- index one_record_per_person_day (person_type, person_id, att_date); the
-- school-day set is one range scan on attendance_records_school_date_idx
-- (school_id, att_date), both from 0017. See
-- docs/research/2026-09-26-attendance-summary-impact.md.

create function public.student_attendance_summary()
returns table (student_id uuid, present_days bigint, school_days bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (now() at time zone 'Asia/Dhaka')::date as today
  ),
  win as (
    select s.id, s.school_id, b.today,
           greatest(
             date_trunc('year', b.today)::date,
             coalesce((se.created_at at time zone 'Asia/Dhaka')::date, date_trunc('year', b.today)::date)
           ) as from_day
      from students s
     cross join bounds b
      left join student_enrollments se on se.id = s.current_enrollment_id
  ),
  -- ponytail: materialized so it is built once, not per Student; each Student
  -- then scans ~200 in-memory rows. Fine to ~10k Students per call; beyond
  -- that, pre-rank days and join by range instead.
  days as materialized (
    select distinct ar.school_id, ar.att_date
      from attendance_records ar, bounds b
     where ar.person_type = 'student'
       and ar.att_date between date_trunc('year', b.today)::date and b.today
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

-- School-wide figure for the dashboard in one row, instead of paging every
-- Student through REST. Student-day weighted: sum of present over sum of
-- possible. Same invoker scoping, because it only reads the function above.
create function public.school_attendance_summary()
returns table (present_days bigint, school_days bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(present_days), 0)::bigint, coalesce(sum(school_days), 0)::bigint
    from public.student_attendance_summary()
$$;

revoke execute on function public.student_attendance_summary() from anon, public;
revoke execute on function public.school_attendance_summary() from anon, public;
grant execute on function public.student_attendance_summary() to authenticated;
grant execute on function public.school_attendance_summary() to authenticated;
