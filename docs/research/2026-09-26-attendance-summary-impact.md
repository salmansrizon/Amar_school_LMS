# 0208 student attendance summary: impact evidence

Draft migration for map 013 (F7/P1). **Not applied.** The user applies it by hand after review, because staging and production share one database. Nothing in this work ran against any database.

## (a) Full SQL

`web/supabase/migrations/0208_student_attendance_summary.sql`:

```sql
-- 0208_student_attendance_summary.sql
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
```

Syntax check: all six statements and both function bodies parse with libpg-query (the real PostgreSQL parser), run offline.

## (b) Existing objects touching the tables read, none replaced

0208 contains exactly two `create function` statements (no `or replace`) and four `revoke`/`grant` statements. It has no `alter`, `drop`, `create policy`, `create index`, `create trigger` or `create view`. The names `student_attendance_summary` and `school_attendance_summary` appear in no migration before 0208: `grep -l` over `web/supabase/migrations/*.sql` matches 0208 only. So each `create function` either creates a new object or fails. It cannot replace one.

How the inventory was made: scan every migration from 0001 to 0207, split into statements (aware of dollar quoting), and keep each `create [or replace] function|view|trigger|policy|index` whose text mentions the table. The numbers in brackets are the migrations that define or redefine the object. Two groups of objects are not listed by name:
- table constraints, such as `one_record_per_person_day`
- policies rebuilt by dynamic `execute format(...)`: 0136 (Permission Grant wrap) and 0150 (student helper wrap)

0208 touches neither group.

### attendance_records: 9 objects
- function absence_sms_candidates (0021,0046)
- function is_absent_working_day (0021,0037,0046)
- function reconcile_attendance (0017,0018,0019,0020,0047,0061)
- function save_student_attendance (0046,0170)
- index attendance_records_school_date_idx (0017)
- policy "school members clean records" (0017)
- policy "school members read records" (0017)
- policy "student reads own attendance" (0146)
- policy "super admin manages records" (0017)
### students: 71 objects
- function absence_sms_candidates (0021,0046)
- function absent_working_days_in_month (0039)
- function absent_working_days_in_range (0053,0146)
- function admit_student_enrollment (0180)
- function app_current_student_id (0131)
- function app_current_student_school_id (0133)
- function apply_profile_change_request (0149,0201)
- function assign_student_no (0131)
- function assign_student_roll (0032,0034,0120)
- function class_teacher_profile_for (0189)
- function close_student_enrollment (0180)
- function create_student_login (0132,0135)
- function enforce_change_request_refs (0149)
- function enforce_cocurricular_mark_school (0052)
- function enforce_exam_mark_school (0048)
- function enforce_student_enrollment_school (0180)
- function enforce_student_message_refs (0148,0174)
- function enforce_student_ref_school (0033)
- function enforce_student_subject_school (0030)
- function enforce_submission_caps (0142)
- function generate_seat_plan (0044)
- function generate_seat_plan_for (0059,0174)
- function is_valid_subdomain (0131)
- function save_student_attendance (0046,0170)
- function set_student_enrollment (0180)
- function set_student_password (0132)
- function staff_class_capacity_for_student (0152,0174,0180)
- function student_by_public_token (0065)
- function student_current_class_offering_id (0193)
- function student_exam_rank (0143)
- function student_in_class (0133)
- function student_in_my_school (0011)
- function student_matches_target (0139,0188,0196,0198)
- function student_profile_for (0148)
- function subscription_bill (0091)
- function subscription_billing_sweep (0104,0168)
- function sync_student_legacy_placement (0186)
- function transfer_student (0035,0036,0048,0060,0120)
- function wave6_reconcile_student_transfers (0184)
- index students_archived_idx (0032)
- index students_current_enrollment_idx (0178)
- index students_profile_unique (0131)
- index students_rfid_card_number_key (0173)
- index students_roll_unique (0034,0120)
- index students_school_idx (0011)
- index students_student_no_unique (0131,0133)
- index students_unique_id_key (0173)
- policy "anon reads valid student card photo" (0065)
- policy "school members manage behaviour log" (0160,0163)
- policy "school members manage students" (0011,0160)
- policy "school members read students" (0163)
- policy "school members write students" (0163)
- policy "super admin manages students" (0011)
- trigger student_assign_no (0131)
- trigger student_assign_roll (0032)
- trigger student_assign_unique_id (0173)
- trigger student_current_enrollment_consistency (0180)
- trigger student_current_enrollment_via_transition_only (0180)
- trigger student_no_immutable (0131)
- trigger student_unique_id_immutable (0173)
- view student_exam_result (0143)
- view student_exam_routine (0145,0192)
- view student_fee_record (0147)
- view student_login_info (0132,0135)
- view student_material (0141,0192,0196,0198)
- view student_message_inbox (0148)
- view student_routine (0137,0192)
- view student_seat_assignment (0145)
- view student_self (0131,0201)
- view student_subject_option (0148,0174,0192)
- view task_completion_roster (0140,0188,0196,0197,0198)
### student_enrollments: 24 objects
- function admit_student_enrollment (0180)
- function assign_enrollment_roll (0181)
- function class_offering_is_used (0202)
- function class_teacher_profile_for (0189)
- function close_student_enrollment (0180)
- function enforce_student_current_enrollment_consistency (0180)
- function set_student_enrollment (0180)
- function staff_class_capacity_for_student (0180)
- function student_current_class_offering_id (0193)
- function student_matches_target (0188,0196,0198)
- function wave6_reconcile_student_transfers (0184)
- index student_enrollments_class_offering_idx (0177)
- index student_enrollments_roll_unique (0181)
- index student_enrollments_school_idx (0177)
- index student_enrollments_student_idx (0177)
- policy "school members read student enrollments" (0177)
- policy "super admin manages student enrollments" (0177)
- trigger student_enrollment_assign_roll (0181)
- trigger student_enrollment_same_school (0180)
- view student_exam_routine (0192)
- view student_material (0192,0196,0198)
- view student_routine (0192)
- view student_subject_option (0192)
- view task_completion_roster (0188,0196,0197,0198)

None of these objects is created, replaced, altered or dropped by 0208.

## (c) Unit tests, before and after

Command: `cd web && npx vitest run tests/unit`.

Before (base `caea0d5`):
```
 Test Files  1 failed | 122 passed (123)
      Tests  1 failed | 1289 passed (1290)
```
After (adds `attendanceBand` plus one test in `tests/unit/dashboard.test.ts`):
```
 Test Files  1 failed | 122 passed (123)
      Tests  1 failed | 1290 passed (1291)
```
The one failure is the same test in both runs: `tests/unit/student-edit-class-field.test.tsx`, "renders one dropdown with the full Class Catalogue label". It already fails on staging and is unrelated to this change. Passing tests go from 1289 to 1290, the extra one being the new test. `tsc --noEmit` is clean outside `.next/`, and eslint is clean on the changed files.

## (d) Expected query plan

Existing indexes:
- `one_record_per_person_day`: unique constraint on `(person_type, person_id, att_date)`, from 0017
- `attendance_records_school_date_idx` on `(school_id, att_date)`, from 0017
- the primary key of `student_enrollments`

How each part of the function should run:
1. **`win`:** a scan of `students` under its RLS (school plus class attachment, 0163), then a left join to `student_enrollments` on its primary key. That is one to a few thousand rows per school.
2. **`days`:** materialized once. It filters on an `att_date` range. The RLS condition `school_id = (select app_current_school_id())` becomes a constant, so the planner can use `attendance_records_school_date_idx` for one range scan over the school's year to date. A hash aggregate then reduces this to about 200 distinct `(school_id, att_date)` pairs.
3. **`present_days`, per Student:** equality on `person_type` and `person_id` plus a range on `att_date` matches the leading columns of `one_record_per_person_day` exactly. So each Student costs one index range scan of about 200 entries, plus a heap fetch for the RLS `school_id` check.
4. **`school_days`, per Student:** a scan of the in-memory `days` CTE, about 200 rows.

In total that is roughly one pass over the school's year-to-date rows (about 270k), with no sequential scan of `attendance_records`. **No new index is needed.**

One risk to measure against the 800 ms budget: the existing `super admin manages records` policy (0017) calls `app_current_role()` without a `(select ...)` wrap, and policies are combined with OR. If Postgres evaluates that branch for each row, it makes one security-definer call per row. That is the same cost 0166 removed for `gl_lines`. Every read of `attendance_records` already pays it, and 0208 does not change it. After applying, sign in as an owner and run `explain (analyze, buffers) select * from student_attendance_summary();`.

## (e) Claims

1. additive only
2. no existing object replaced or altered
3. all unit tests that passed before still pass
4. results scoped to the caller's school via RLS / explicit predicate
5. no student can read another student's rate

Supporting facts:
- **RLS applies to every read.** Both functions are `security invoker` with `set search_path = public`, so each table read runs under the caller's own RLS.
- **Students get nothing.** Students have no select policy on `students` (0131, "Students therefore get NO policy on students at all"). The `win` CTE is therefore empty for a Student: `student_attendance_summary()` returns zero rows and `school_attendance_summary()` returns 0/0. A Student can read no rate, including their own.
- **No anonymous access.** Execute is revoked from `anon` and `public` and granted only to `authenticated`.
- **Owners and staff stay in their school.** They see only their own school's `students` rows (`school_id = app_current_school_id()`, narrowed by class attachment, 0163) and only their own school's `attendance_records` (0017, with the Permission Grant wrap from 0136).
- **Super admin sees every school, by design.** Because `days` is keyed by `school_id`, each Student is still measured against their own school's days.

## jev verdicts

`jev_verify` (model jev-latest, auto_accept 0.8), with this document as the only evidence:

| # | Claim | Verdict | Confidence |
|---|-------|---------|------------|
| 0 | additive only | verified | 1.00 |
| 1 | no existing object replaced or altered | verified | 1.00 |
| 2 | all unit tests that passed before still pass | verified | 1.00 |
| 3 | results scoped to the caller's school via RLS / explicit predicate | verified | 1.00 |
| 4 | no student can read another student's rate | verified | 0.99 |

Summary: 5 verified, 0 contradicted, 0 unsupported, 0 needs review. jev checks these claims against this document, not against the live database. Claims 3 and 4 still depend on the RLS state in the migrations matching what is deployed.
