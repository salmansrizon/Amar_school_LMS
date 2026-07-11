-- Attendance I (issue #29, PRD §5.3): manual student attendance marking,
-- leave approval workflow (student + employee), off-day significance.
-- off_days/student_leaves exist from the absence-SMS work (#12); this adds
-- the approval lifecycle CONTEXT.md already assumes ("approved leave" in the
-- working-day formula) plus the tables/RPC the new UI needs. Additive only.

alter table public.off_days
  add column if not exists is_significant boolean not null default false;

-- Approval lifecycle for existing leave requests. Default 'pending' so a bare
-- insert (e.g. the legacy /school/sms quick-add form) requires an explicit
-- approve before it excuses an absence — matches CONTEXT.md's "approved leave".
alter table public.student_leaves
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists reason text,
  add column if not exists created_at timestamptz not null default now();

create table public.employee_leaves (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  from_day date not null,
  to_day date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  check (to_day >= from_day)
);
create index employee_leaves_school_idx on public.employee_leaves (school_id);

-- Manual "why absent" text, kept out of attendance_records: absence there is
-- inferred by ABSENCE of a record (see is_absent_working_day), not a status
-- value, so a cause note must live in its own table to avoid creating a row
-- that would flip a student to "present" in the streak/fine formulas.
create table public.attendance_absence_notes (
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  person_type text not null check (person_type in ('student', 'employee')),
  person_id uuid not null,
  att_date date not null,
  cause text,
  created_at timestamptz not null default now(),
  primary key (person_type, person_id, att_date)
);
create index attendance_absence_notes_school_idx on public.attendance_absence_notes (school_id);

alter table public.employee_leaves enable row level security;
alter table public.attendance_absence_notes enable row level security;

create policy "school members manage employee leaves" on public.employee_leaves
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages employee leaves" on public.employee_leaves
  for all using (public.app_current_role() = 'super_admin');

create policy "school members manage absence notes" on public.attendance_absence_notes
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages absence notes" on public.attendance_absence_notes
  for all using (public.app_current_role() = 'super_admin');

-- Tenancy: the employee must belong to the row's School (mirrors
-- enforce_class_ref_school from 0029).
create function public.enforce_employee_leave_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from employees where id = new.employee_id and school_id = new.school_id
  ) then
    raise exception 'employee does not belong to this school';
  end if;
  return new;
end $$;

create trigger employee_leave_same_school
  before insert or update on public.employee_leaves
  for each row execute function public.enforce_employee_leave_school();

-- Manual roster marking for a School member's own School (session-scoped,
-- unlike the RFID job's job-secret RPCs). One call saves a whole class's
-- roster for one date: present rows upsert attendance_records (status
-- 'present', clearing any stale absence note); absent rows clear any prior
-- attendance_records row and upsert the cause note. Overrides RFID
-- reconciliation for that person/day — an owner's manual mark is authoritative.
create function public.save_student_attendance(p_att_date date, p_records jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  school uuid := public.app_current_school_id();
  n int := 0;
  rec jsonb;
  sid uuid;
begin
  if school is null then
    raise exception 'no school context';
  end if;
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'records must be an array';
  end if;

  for rec in select * from jsonb_array_elements(p_records) loop
    sid := (rec ->> 'student_id')::uuid;
    if not exists (select 1 from students where id = sid and school_id = school) then
      raise exception 'student does not belong to this school';
    end if;

    if (rec ->> 'present')::boolean then
      insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
      values (school, 'student', sid, p_att_date, now(), null, 'present')
      on conflict (person_type, person_id, att_date) do update
        set entry_at = excluded.entry_at, exit_at = null, status = 'present';
      delete from attendance_absence_notes
        where person_type = 'student' and person_id = sid and att_date = p_att_date;
    else
      delete from attendance_records
        where person_type = 'student' and person_id = sid and att_date = p_att_date;
      insert into attendance_absence_notes (school_id, person_type, person_id, att_date, cause)
      values (school, 'student', sid, p_att_date, nullif(rec ->> 'cause', ''))
      on conflict (person_type, person_id, att_date) do update set cause = excluded.cause;
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;

revoke execute on function public.save_student_attendance(date, jsonb) from anon, public;
grant execute on function public.save_student_attendance(date, jsonb) to authenticated;

-- Re-point the working-day/absence-streak formula at APPROVED leave only
-- (CONTEXT.md §5.7: "approved leave" excuses a working day — a pending
-- request must not). Same signatures, replaced in place per project
-- convention for evolving a prior migration's functions.
create or replace function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
    and not exists (
      select 1 from student_leaves l
      where l.student_id = sid and l.status = 'approved' and d between l.from_day and l.to_day
    )
    and not exists (
      select 1 from attendance_records ar
      where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
    )
$$;

create or replace function public.absence_sms_candidates(job_secret text, target_date date)
returns table (
  school_id uuid,
  student_id uuid,
  student_name text,
  guardian_phone text,
  rule_id uuid,
  streak int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  return query
  with recursive streaks as (
    select s.school_id, s.id as sid, target_date as day, 1 as depth
    from students s
    where public.is_absent_working_day(s.id, s.school_id, target_date)
    union all
    select st.school_id, st.sid, prev.day, st.depth + 1
    from streaks st
    cross join lateral (
      select d::date as day
      from generate_series(st.day - 1, st.day - 60, interval '-1 day') g(d)
      where not exists (select 1 from off_days o where o.school_id = st.school_id and o.day = g.d::date)
        and not exists (
          select 1 from student_leaves l
          where l.student_id = st.sid and l.status = 'approved' and g.d::date between l.from_day and l.to_day
        )
      order by g.d desc
      limit 1
    ) prev
    where st.depth < 60
      and not exists (
        select 1 from attendance_records ar
        where ar.person_type = 'student' and ar.person_id = st.sid and ar.att_date = prev.day
      )
  ),
  streak_len as (
    select st.school_id, st.sid, max(st.depth) as streak
    from streaks st
    group by st.school_id, st.sid
  )
  select sl.school_id, sl.sid, s.full_name, s.guardian_phone, r.id, sl.streak
  from streak_len sl
  join students s on s.id = sl.sid
  join absence_sms_rules r on r.school_id = sl.school_id
  where (r.exact_days is not null and sl.streak = r.exact_days)
     or (r.range_from is not null and sl.streak between r.range_from and r.range_to);
end $$;
