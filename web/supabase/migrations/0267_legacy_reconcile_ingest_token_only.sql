-- Pre-Phase-8 reconciliation cutover: the two-argument reconcile_attendance
-- becomes LEGACY-ONLY. FUNCTION ONLY: no table, column, constraint, policy or
-- data change.
--
-- WHY NOT DROP IT
--   Deployed main (origin/main 48b6dce) still schedules
--   /api/attendance/reconcile daily (vercel.json, 30 12 * * *), and main's
--   route calls reconcile_attendance(job_secret, target_date) directly. Staging
--   moved that route to enqueue_attendance_reconcile_dates /
--   drain_attendance_reconcile_queue (0215, commit f23d582), but that change
--   has not reached main. Staging and main share this database, so dropping
--   the function would make production's only reconcile job fail every day.
--   It can be dropped in a later migration once main serves the queue route.
--
-- WHY HARDEN IT
--   Its body (0211, still live) picks EVERY unprocessed event of the UTC day
--   and resolves it by card_number through machine_enroll_infos. An Attendance
--   Agent event (source = 'agent', Phase 8) may carry a card number, so this
--   job could resolve it by card - bypassing the enrollment-episode rule
--   (0263) and marking it processed so the episode path never sees it.
--
-- WHAT
--   day_events now selects source = 'ingest_token' only. Everything else is
--   the live body unchanged (the exact text of pg_get_functiondef at the time
--   of writing): job-secret check, automatic_attendance_enabled, UTC day
--   window, card join, merge-safe upsert, grace/exemption windows, and
--   consuming only resolved events. Agent events are left unprocessed for the
--   queue drain, which resolves them through enrollment episodes only.
--   Legacy RFID taps behave exactly as before.
--
-- ROLLBACK
--   Re-create the function without the "and ae.source = 'ingest_token'" line.

create or replace function public.reconcile_attendance(job_secret text, target_date date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      and ae.source = 'ingest_token'
      and ae.tapped_at >= target_date::timestamptz
      and ae.tapped_at < (target_date + 1)::timestamptz
  ),
  resolved as (
    select de.id as event_id, de.school_id,
           m.type as person_type,
           coalesce(m.student_id, m.employee_id) as person_id,
           de.tapped_at
    from day_events de
    join machine_enroll_infos m on m.school_id = de.school_id and m.rfid_card_number = de.card_number
  ),
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
             select min(ot.starts_at) from employee_office_times eot
             join office_times ot on ot.id = eot.office_time_id where eot.employee_id = c.person_id
           ) end as office_start,
           case when c.person_type = 'employee' then (
             select max(ot.ends_at) from employee_office_times eot
             join office_times ot on ot.id = eot.office_time_id where eot.employee_id = c.person_id
           ) end as office_end,
           case when c.person_type = 'employee' then (
             select coalesce(max(v), 0) from (
               select sgr.grace_minutes as v from employees e2
                 join standing_grace_rule_categories sgrc on sgrc.category = e2.category
                 join standing_grace_rules sgr
                   on sgr.id = sgrc.rule_id and sgr.school_id = e2.school_id
                 where e2.id = c.person_id
               union all
               select ahe.duration_minutes from employees e2
                 join ad_hoc_grace_exemption_categories ahec on ahec.category = e2.category
                 join ad_hoc_grace_exemptions ahe
                   on ahe.id = ahec.exemption_id
                  and ahe.school_id = e2.school_id
                  and ahe.exemption_date = target_date
                 where e2.id = c.person_id
             ) levels
           ) end as grace
    from collapsed c
  ),
  written as (
    insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
    select school_id, person_type, person_id, target_date, entry_at, exit_at,
      case
        when person_type = 'student' or office_start is null or office_end is null then 'present'
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
             (target_date::timestamptz + w.office_start::interval) as att_start,
             (target_date::timestamptz + w.office_end::interval) as att_end
      from windows w
    ) final
    on conflict (person_type, person_id, att_date) do update
      set entry_at = excluded.entry_at,
          exit_at = excluded.exit_at,
          status = excluded.status
    returning 1
  ),
  consumed as (
    update attendance_events set processed = true
    where id in (select event_id from resolved)
    returning 1
  )
  select count(*) into upserted from written;

  return upserted;
end $function$;

comment on function public.reconcile_attendance(text, date) is
  'LEGACY (deployed main''s daily cron). Reconciles source = ''ingest_token'' card taps only; Agent events are resolved by drain_attendance_reconcile_queue through enrollment episodes. Drop once main uses the queue route.';
