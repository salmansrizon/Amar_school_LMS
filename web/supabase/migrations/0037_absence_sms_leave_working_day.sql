-- Ensure approved leave excludes a student from absence-SMS candidates.
-- The deployed helper predates the leave check in 0021.
create or replace function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
    and not exists (
      select 1
      from student_leaves l
      where l.student_id = sid
        and l.status = 'approved'
        and d between l.from_day and l.to_day
    )
    and not exists (
      select 1 from attendance_records ar
      where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
    )
$$;
