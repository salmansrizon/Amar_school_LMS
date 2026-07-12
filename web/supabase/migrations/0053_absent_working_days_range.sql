-- Exams IV (issue #33, PRD §5.5): the progress report's Attendance % figure
-- needs a present/total-working-days ratio, not a raw attendance_records
-- row count — attendance_records only ever holds PRESENT-ish rows (absence
-- is inferred from the ABSENCE of a row, see migration 0046), and off-
-- days/approved leave must not count against the student either way.
-- Rather than reimplement that walk, this generalizes issue #34's
-- absent_working_days_in_month (migration 0039, itself built on
-- is_absent_working_day) to an arbitrary date range, so a school-year-to-
-- date window doesn't need 12 separate month calls. Additive only.
create function public.absent_working_days_in_range(p_student uuid, p_start date, p_end date)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid;
  v_count int;
begin
  select school_id into v_school from students where id = p_student;
  if v_school is null then
    raise exception 'unknown student';
  end if;
  if v_school is distinct from public.app_current_school_id()
     and public.app_current_role() is distinct from 'super_admin' then
    raise exception 'student not accessible';
  end if;

  select count(*) into v_count
  from generate_series(p_start, p_end, interval '1 day') gs(d)
  where public.is_absent_working_day(p_student, v_school, gs.d::date);

  return v_count;
end $$;

revoke execute on function public.absent_working_days_in_range(uuid, date, date) from public;
grant execute on function public.absent_working_days_in_range(uuid, date, date) to authenticated;
