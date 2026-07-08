-- RFID Attendance Event ingestion + reconciliation (issue #10, ADR 0001).
-- Dual-path ingest (device push or bridge-agent batch) writes raw taps to a
-- staging table via a token-gated RPC; a scheduled job collapses them:
-- earliest tap = entry, latest tap = exit, taps in between are noise.

alter table public.shifts
  add column starts_at time,
  add column ends_at time;

alter table public.schools
  add column ingest_token uuid not null default gen_random_uuid();

create table public.rfid_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  card_number text not null,
  student_id uuid references public.students (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_holder check (num_nonnulls(student_id, employee_id) = 1),
  constraint card_unique_per_school unique (school_id, card_number)
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  card_number text not null,
  tapped_at timestamptz not null,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create index attendance_events_school_day_idx
  on public.attendance_events (school_id, tapped_at) where not processed;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  person_type text not null check (person_type in ('student', 'employee')),
  person_id uuid not null,
  att_date date not null,
  entry_at timestamptz not null,
  exit_at timestamptz,
  status text not null check (status in ('present', 'on_time', 'late_entry', 'exit_early', 'late_exit_early')),
  created_at timestamptz not null default now(),
  constraint one_record_per_person_day unique (person_type, person_id, att_date)
);

create index attendance_records_school_date_idx on public.attendance_records (school_id, att_date);

-- Job secret for the scheduled reconciliation caller (no user session).
create table public.vendor_secrets (
  key text primary key,
  value text not null
);
alter table public.vendor_secrets enable row level security;
-- No policies: unreachable through the API; only definer functions read it.

alter table public.rfid_cards enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;

create policy "school members manage cards" on public.rfid_cards
  for all using (school_id = public.app_current_school_id());
create policy "school members read events" on public.attendance_events
  for select using (school_id = public.app_current_school_id());
create policy "school members clean events" on public.attendance_events
  for delete using (school_id = public.app_current_school_id());
create policy "school members read records" on public.attendance_records
  for select using (school_id = public.app_current_school_id());
create policy "school members clean records" on public.attendance_records
  for delete using (school_id = public.app_current_school_id());
create policy "super admin manages cards" on public.rfid_cards
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages events" on public.attendance_events
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin manages records" on public.attendance_records
  for all using (public.app_current_role() = 'super_admin');

-- Dual-path ingest: one RPC serves both device push (1 event) and bridge-agent
-- batches. Token-gated per School; callable without a session (ADR 0001).
create function public.ingest_attendance_events(school uuid, token uuid, events jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  inserted int;
begin
  if not exists (select 1 from schools where id = school and ingest_token = token) then
    raise exception 'invalid ingest token';
  end if;
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events) = 0 then
    raise exception 'events must be a non-empty array';
  end if;
  if jsonb_array_length(events) > 5000 then
    raise exception 'batch too large';
  end if;

  insert into attendance_events (school_id, card_number, tapped_at)
  select school,
         e ->> 'card_number',
         (e ->> 'tapped_at')::timestamptz
  from jsonb_array_elements(events) e
  where coalesce(e ->> 'card_number', '') <> '' and e ->> 'tapped_at' is not null;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

revoke execute on function public.ingest_attendance_events(uuid, uuid, jsonb) from public;
grant execute on function public.ingest_attendance_events(uuid, uuid, jsonb) to anon, authenticated;

-- The daily reconciliation job. Secret-gated (scheduled caller has no session).
-- Collapses each person's taps for the date into one finalized record, applying
-- the shift window + Considerable Grace Window for employees.
create function public.reconcile_attendance(job_secret text, target_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  upserted int;
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  with day_events as (
    select ae.school_id, ae.card_number, ae.tapped_at, ae.id
    from attendance_events ae
    where not ae.processed
      and ae.tapped_at >= target_date::timestamptz
      and ae.tapped_at < (target_date + 1)::timestamptz
  ),
  resolved as (
    select de.school_id,
           case when c.employee_id is not null then 'employee' else 'student' end as person_type,
           coalesce(c.employee_id, c.student_id) as person_id,
           de.tapped_at
    from day_events de
    join rfid_cards c on c.school_id = de.school_id and c.card_number = de.card_number
  ),
  collapsed as (
    select school_id, person_type, person_id,
           min(tapped_at) as entry_at,
           case when count(*) > 1 then max(tapped_at) end as exit_at
    from resolved
    group by school_id, person_type, person_id
  ),
  windows as (
    select c.*,
           case when c.person_type = 'employee' then (
             select min(sh.starts_at) from employee_shifts es
             join shifts sh on sh.id = es.shift_id where es.employee_id = c.person_id
           ) end as shift_start,
           case when c.person_type = 'employee' then (
             select max(sh.ends_at) from employee_shifts es
             join shifts sh on sh.id = es.shift_id where es.employee_id = c.person_id
           ) end as shift_end,
           case when c.person_type = 'employee' then (
             select coalesce(max(v), 0) from (
               select s2.default_grace_minutes as v from employees e2
                 join schools s2 on s2.id = e2.school_id where e2.id = c.person_id
               union all
               select cg.grace_minutes from employees e2
                 join category_grace_minutes cg
                   on cg.school_id = e2.school_id and cg.category = e2.category
                 where e2.id = c.person_id
               union all
               select sh.grace_minutes from employee_shifts es
                 join shifts sh on sh.id = es.shift_id where es.employee_id = c.person_id
               union all
               select e2.grace_override_minutes from employees e2 where e2.id = c.person_id
             ) levels
           ) end as grace
    from collapsed c
  )
  insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
  select school_id, person_type, person_id, target_date, entry_at, exit_at,
    case
      when person_type = 'student' or shift_start is null or shift_end is null then 'present'
      else (
        case
          when entry_at > (att_start + make_interval(mins => grace)) and exit_at is not null and exit_at < att_end then 'late_exit_early'
          when entry_at > (att_start + make_interval(mins => grace)) then 'late_entry'
          when exit_at is not null and exit_at < att_end then 'exit_early'
          else 'on_time'
        end
      )
    end
  from (
    select w.*,
           (target_date::timestamptz + w.shift_start::interval) as att_start,
           (target_date::timestamptz + w.shift_end::interval) as att_end
    from windows w
  ) final
  on conflict (person_type, person_id, att_date) do update
    set entry_at = excluded.entry_at,
        exit_at = excluded.exit_at,
        status = excluded.status;

  get diagnostics upserted = row_count;

  update attendance_events set processed = true
  where not processed
    and tapped_at >= target_date::timestamptz
    and tapped_at < (target_date + 1)::timestamptz;

  return upserted;
end $$;

revoke execute on function public.reconcile_attendance(text, date) from public;
grant execute on function public.reconcile_attendance(text, date) to anon, authenticated;
