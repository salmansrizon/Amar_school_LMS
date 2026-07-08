-- Greploop fix for issue #10: a card's holder must belong to the card's own
-- school. The plain FKs only required the student/employee to exist SOMEWHERE,
-- so a school could link a card to another school's person (directly via
-- PostgREST — an app-level check alone cannot close this). Composite FKs
-- enforce it in the database. Also scope the backfill merge join by school_id
-- for defense in depth, and guard the ingest function against malformed
-- tapped_at timestamps (skip invalid rows instead of aborting the batch).

alter table public.students
  add constraint students_school_scoped unique (school_id, id);
alter table public.employees
  add constraint employees_school_scoped unique (school_id, id);

alter table public.rfid_cards
  drop constraint rfid_cards_student_id_fkey,
  drop constraint rfid_cards_employee_id_fkey,
  add constraint rfid_cards_student_same_school
    foreign key (school_id, student_id)
    references public.students (school_id, id) on delete cascade,
  add constraint rfid_cards_employee_same_school
    foreign key (school_id, employee_id)
    references public.employees (school_id, id) on delete cascade;

-- Safe-cast helper: returns null (instead of throwing) for unparseable input.
-- Used by ingest to skip malformed timestamps without aborting the batch.
create or replace function public.safe_timestamptz(val text) returns timestamptz
language plpgsql immutable strict as $$
begin
  return val::timestamptz;
exception when others then
  return null;
end $$;

-- Recreate ingest with safe tapped_at cast: skip malformed timestamps instead
-- of aborting the entire batch.
create or replace function public.ingest_attendance_events(school uuid, token uuid, events jsonb)
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
         public.safe_timestamptz(e ->> 'tapped_at')
  from jsonb_array_elements(events) e
  where coalesce(e ->> 'card_number', '') <> ''
    and public.safe_timestamptz(e ->> 'tapped_at') is not null;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

create or replace function public.reconcile_attendance(job_secret text, target_date date)
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
    select de.id as event_id, de.school_id,
           case when c.employee_id is not null then 'employee' else 'student' end as person_type,
           coalesce(c.employee_id, c.student_id) as person_id,
           de.tapped_at
    from day_events de
    join rfid_cards c on c.school_id = de.school_id and c.card_number = de.card_number
  ),
  -- Merge new taps with any record already written for the day (backfill),
  -- so the window only ever widens across re-runs.
  collapsed as (
    select r.school_id, r.person_type, r.person_id,
           least(min(r.tapped_at), min(ar.entry_at)) as entry_at,
           nullif(
             greatest(max(r.tapped_at), max(ar.entry_at), max(ar.exit_at)),
             least(min(r.tapped_at), min(ar.entry_at))
           ) as exit_at
    from resolved r
    left join attendance_records ar
      on ar.school_id = r.school_id
     and ar.person_type = r.person_type
     and ar.person_id = r.person_id
     and ar.att_date = target_date
    group by r.school_id, r.person_type, r.person_id
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
  ),
  written as (
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
      -- NOTE: shift times are interpreted as UTC for now.
      -- ponytail: single-timezone assumption; add schools.timezone and shift
      -- window conversion when a non-UTC deployment needs local-time statuses.
      select w.*,
             (target_date::timestamptz + w.shift_start::interval) as att_start,
             (target_date::timestamptz + w.shift_end::interval) as att_end
      from windows w
    ) final
    on conflict (person_type, person_id, att_date) do update
      set entry_at = excluded.entry_at,
          exit_at = excluded.exit_at,
          status = excluded.status
    returning 1
  ),
  -- Consume ONLY the events that resolved to a person; unregistered-card taps
  -- stay unprocessed for replay after the card is registered.
  consumed as (
    update attendance_events set processed = true
    where id in (select event_id from resolved)
    returning 1
  )
  select count(*) into upserted from written;

  return upserted;
end $$;
