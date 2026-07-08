-- Greploop fix for issue #10: reconciliation must consume ONLY the taps it
-- actually resolved. Taps from unregistered cards stay unprocessed, so
-- registering the card later and re-running reconciliation replays them.

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
