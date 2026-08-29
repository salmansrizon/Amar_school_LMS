-- 0146_student_attendance_leave.sql
-- Map #434 / tickets #451 + #452: a Student's own attendance record, and their
-- own leave requests.

-- ---------------------------------------------------------------------------
-- 1. Their own attendance rows.
--
-- attendance_records only ever holds present-ish rows — a trap the progress
-- report already hit — so the *percentage* must come from
-- absent_working_days_in_range, not from counting these. This policy only makes
-- the calendar's marked days visible.
drop policy if exists "student reads own attendance" on public.attendance_records;
create policy "student reads own attendance" on public.attendance_records
  for select using (
    person_type = 'student' and person_id = public.app_current_student_id()
  );

-- attendance_absence_notes is deliberately NOT opened.
--
-- #451 asked for a decision and this is it: no. The free text was written by
-- staff, about the Student, without any expectation that they would read it —
-- exactly the reasoning that keeps behaviour_log_entries out of this map's
-- scope. Surfacing it retroactively would change how staff write it.

-- absent_working_days_in_range is SECURITY DEFINER and takes a student id, so
-- it would happily answer for anybody. Wrap the caller's own id rather than
-- granting the raw function to students.
create or replace function public.student_absent_working_days(p_start date, p_end date)
returns int
language sql stable security definer set search_path = public as $$
  select public.absent_working_days_in_range(public.app_current_student_id(), p_start, p_end)
$$;

revoke execute on function public.student_absent_working_days(date, date) from anon;
grant execute on function public.student_absent_working_days(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Their own leave.
--
-- Select and insert only. No update, no delete: a request under review is not
-- the Student's to edit, and letting them withdraw one after approval would
-- silently un-excuse an absence the fine and SMS rules have already honoured.
--
-- The status default is 'pending' (0046), and the WITH CHECK does not mention
-- status — so a Student cannot insert an already-approved row.
drop policy if exists "student reads own leave" on public.student_leaves;
create policy "student reads own leave" on public.student_leaves
  for select using (student_id = public.app_current_student_id());

drop policy if exists "student requests own leave" on public.student_leaves;
create policy "student requests own leave" on public.student_leaves
  for insert with check (
    student_id = public.app_current_student_id()
    and school_id = public.app_current_student_school_id()
    and to_day >= from_day
  );

-- ---------------------------------------------------------------------------
-- 3. A pending request must not excuse anything yet.
--
-- Belt and braces on the insert policy: the fine and SMS rules read
-- student_leaves.status, so a row arriving as anything but 'pending' from the
-- student side would excuse an absence nobody approved.
create or replace function public.enforce_student_leave_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() = 'student' and new.status is distinct from 'pending' then
    raise exception 'a student may only create a pending leave request';
  end if;
  return new;
end $$;

drop trigger if exists student_leave_pending on public.student_leaves;
create trigger student_leave_pending
  before insert on public.student_leaves
  for each row execute function public.enforce_student_leave_pending();

-- ---------------------------------------------------------------------------
-- 4. The off-day calendar a Student sees alongside their leave.
-- off_days and central_off_days were already opened by 0139/0137.

-- ---------------------------------------------------------------------------
-- 5. absent_working_days_in_range must answer for the Student themselves.
--
-- It gates on app_current_school_id(), null for a Student since 0131, so a
-- Student asking about their OWN attendance was refused. Fixed at the guard
-- rather than by reimplementing the count student-side: #451 is explicit that
-- this definition must not be duplicated, because it is the same one the
-- absent-fine formula and the absence-SMS rules use and a second copy would let
-- the calendar drift away from the money. One clause; every existing caller
-- behaves identically.
create or replace function public.absent_working_days_in_range(p_student uuid, p_start date, p_end date)
returns integer
language plpgsql stable security definer set search_path = public as $function$
declare
  v_school uuid;
  v_count int;
begin
  select school_id into v_school from students where id = p_student;
  if v_school is null then
    raise exception 'unknown student';
  end if;
  if v_school is distinct from public.app_current_school_id()
     and public.app_current_role() is distinct from 'super_admin'
     and p_student is distinct from public.app_current_student_id() then
    raise exception 'student not accessible';
  end if;

  select count(*) into v_count
  from generate_series(p_start, p_end, interval '1 day') gs(d)
  where public.is_absent_working_day(p_student, v_school, gs.d::date);

  return v_count;
end $function$;
