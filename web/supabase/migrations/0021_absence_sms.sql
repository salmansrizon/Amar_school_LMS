-- Absence SMS Rule (issue #12, PRD §5.7).
-- Working days = Total − Off Days − Approved Leave − Present (shared
-- definition with the absent-fine formula). Evaluated once daily AFTER
-- attendance reconciliation, never on each mark.

alter table public.students add column guardian_phone text;

create table public.off_days (
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  day date not null,
  label text,
  primary key (school_id, day)
);

create table public.student_leaves (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  student_id uuid not null references public.students (id) on delete cascade,
  from_day date not null,
  to_day date not null,
  check (to_day >= from_day)
);

create table public.absence_sms_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  exact_days int check (exact_days is null or exact_days >= 1),
  range_from int check (range_from is null or range_from >= 1),
  range_to int check (range_to is null or range_to >= 1),
  created_at timestamptz not null default now(),
  -- exactly one shape: exact N, or a range X–Y
  constraint rule_shape check (
    (exact_days is not null and range_from is null and range_to is null)
    or (exact_days is null and range_from is not null and range_to is not null and range_to >= range_from)
  )
);

create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  rule_id uuid references public.absence_sms_rules (id) on delete set null,
  sent_on date not null,
  phone text,
  body text not null,
  provider text not null,
  created_at timestamptz not null default now(),
  -- one absence SMS per student per rule per day
  constraint one_sms_per_rule_day unique (student_id, rule_id, sent_on)
);

alter table public.off_days enable row level security;
alter table public.student_leaves enable row level security;
alter table public.absence_sms_rules enable row level security;
alter table public.sms_log enable row level security;

create policy "school members manage off days" on public.off_days
  for all using (school_id = public.app_current_school_id());
create policy "school members manage leaves" on public.student_leaves
  for all using (school_id = public.app_current_school_id());
create policy "school members manage sms rules" on public.absence_sms_rules
  for all using (school_id = public.app_current_school_id());
create policy "school members read sms log" on public.sms_log
  for select using (school_id = public.app_current_school_id());
create policy "super admin manages off days" on public.off_days
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages leaves" on public.student_leaves
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages sms rules" on public.absence_sms_rules
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages sms log" on public.sms_log
  for all using (public.app_current_role() = 'super_admin');

-- Helper: is target_date a working day for the student AND are they absent?
-- NOTE: must be created BEFORE absence_sms_candidates which references it.
create function public.is_absent_working_day(sid uuid, school uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from off_days o where o.school_id = school and o.day = d)
    and not exists (
      select 1 from student_leaves l where l.student_id = sid and d between l.from_day and l.to_day
    )
    and not exists (
      select 1 from attendance_records ar
      where ar.person_type = 'student' and ar.person_id = sid and ar.att_date = d
    )
$$;

-- Consecutive working-day absence streak per student, ending at target_date.
-- A working day for a student: not an off day, not covered by approved leave.
-- Absent: no attendance record that day. Streak breaks on a present working day.
create function public.absence_sms_candidates(job_secret text, target_date date)
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
    -- day 0: students absent on target_date (a working day for them)
    select s.school_id, s.id as sid, target_date as day, 1 as depth
    from students s
    where public.is_absent_working_day(s.id, s.school_id, target_date)
    union all
    -- walk backwards over that student's previous working day
    select st.school_id, st.sid, prev.day, st.depth + 1
    from streaks st
    cross join lateral (
      select d::date as day
      from generate_series(st.day - 1, st.day - 60, interval '-1 day') g(d)
      where not exists (select 1 from off_days o where o.school_id = st.school_id and o.day = g.d::date)
        and not exists (
          select 1 from student_leaves l
          where l.student_id = st.sid and g.d::date between l.from_day and l.to_day
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

-- The job writes the log through this (dedupes on the unique constraint).
create function public.record_absence_sms(
  job_secret text,
  p_school uuid,
  p_student uuid,
  p_rule uuid,
  p_sent_on date,
  p_phone text,
  p_body text,
  p_provider text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;
  insert into sms_log (school_id, student_id, rule_id, sent_on, phone, body, provider)
  values (p_school, p_student, p_rule, p_sent_on, p_phone, p_body, p_provider)
  on conflict (student_id, rule_id, sent_on) do nothing;
  return found;
end $$;

revoke execute on function public.absence_sms_candidates(text, date) from public;
revoke execute on function public.record_absence_sms(text, uuid, uuid, uuid, date, text, text, text) from public;
grant execute on function public.absence_sms_candidates(text, date) to anon, authenticated;
grant execute on function public.record_absence_sms(text, uuid, uuid, uuid, date, text, text, text) to anon, authenticated;