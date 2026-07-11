-- Attendance II (issue #30, PRD §5.3 automated half + §6.9 leftovers):
-- per-school manual-attendance override switch (legacy "de-activate
-- automatic attendance" toggle). Everything else this ticket ships —
-- employee 6-state status display, the attendance book — is pure
-- read/derive over tables issue #9/#10/#29 already created; no new tables.

alter table public.schools
  add column automatic_attendance_enabled boolean not null default true;

-- Owner/staff-scoped setter, mirrors set_school_default_grace (issue #9).
create function public.set_automatic_attendance_enabled(enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_current_role() not in ('school_owner', 'staff_user') then
    raise exception 'school members only';
  end if;
  update schools set automatic_attendance_enabled = enabled
  where id = public.app_current_school_id();
end $$;

revoke execute on function public.set_automatic_attendance_enabled(boolean) from anon, public;
grant execute on function public.set_automatic_attendance_enabled(boolean) to authenticated;

-- Re-point reconcile_attendance to skip any School that has switched off
-- automatic attendance: its raw taps stay unprocessed/untouched and the
-- School relies entirely on manual marking (save_student_attendance, #29).
-- IMPORTANT: this is layered on top of the LATEST prior version (0020's
-- rfid_card_same_school, which itself carries 0018's "consume only resolved
-- events" fix and 0019's backfill-merge fix) — not the original 0017 body.
-- Same signature, replaced in place per project convention.
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
    join schools s on s.id = ae.school_id and s.automatic_attendance_enabled
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
