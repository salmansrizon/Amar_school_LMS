-- Machine Attendance, Phase 3 (Architecture Baseline v1.1 §13, §15.2;
-- ADR 0033): the per-(School, day) reconcile resolves Attendance Agent
-- events through enrollment episodes.
--
-- Replaces only public._reconcile_attendance_pair (0215), which the queue
-- drain and the three-argument reconcile_attendance call. Its body is 0215's
-- with one change, the `resolved` step:
--
--   * source = 'ingest_token' (legacy card taps): resolved by card number
--     through machine_enroll_infos, exactly as before.
--   * source = 'agent': resolved ONLY through the attendance_machine_enrollments
--     episode for the event's own (machine_id, machine_user_id) whose link
--     window contains the punch: linked_at <= tapped_at < unlinked_at (open
--     episode: no upper bound). At most one episode can match (0220's
--     no-overlap constraint). The person comes from the episode itself, so a
--     closed episode keeps resolving its own period after the person leaves
--     the device or the ID is reused. Pending (never-linked) and cancelled
--     episodes match nothing. No bare (school_id, unique_id) lookup, and no
--     card lookup for Agent events, even if one carries a card number.
--   * Anything unresolved stays unprocessed, as before (later: legacy aliases,
--     Phase 11).
--
-- Unchanged: the advisory lock, the automatic-attendance gate, the merge with
-- an existing attendance_records row (least/greatest), status rules, grace,
-- "consume only resolved taps", the queue, the drain, and the two-argument
-- reconcile_attendance that deployed code on main still calls. That old
-- function matches by card without looking at source, so an Agent event that
-- happened to carry a card number could be matched by card there. None can
-- exist before the Agent ingest (Phase 8), and the old function is dropped
-- once main runs the queue route (the planned contract step).
-- tapped_at is the authoritative UTC time for both sources (for Agent events
-- the future ingest derives it server-side from device_local_time).

create or replace function public._reconcile_attendance_pair(target_school uuid, target_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  upserted int;
begin
  -- One reconcile per pair at a time: two concurrent runs could otherwise each
  -- merge from their own snapshot and the later commit narrow the window.
  perform pg_advisory_xact_lock(hashtextextended('attendance_reconcile:' || target_school::text || ':' || target_date::text, 0));

  with day_events as (
    select ae.school_id, ae.source, ae.card_number, ae.machine_id, ae.machine_user_id, ae.tapped_at, ae.id
    from attendance_events ae
    join schools s on s.id = ae.school_id and s.automatic_attendance_enabled
    where not ae.processed
      and ae.school_id = target_school
      and ae.attendance_date = target_date
  ),
  resolved as (
    -- Legacy card taps (ADR 0001): by card number, exactly as before.
    select de.id as event_id, de.school_id,
           m.type as person_type,
           coalesce(m.student_id, m.employee_id) as person_id,
           de.tapped_at
    from day_events de
    join machine_enroll_infos m on m.school_id = de.school_id and m.rfid_card_number = de.card_number
    where de.source = 'ingest_token'
    union all
    -- Agent events (ADR 0033): only through the enrollment episode of THIS
    -- machine and device user ID whose link window [linked_at, unlinked_at)
    -- contains the punch. Never by card, never by a bare unique_id.
    select de.id as event_id, de.school_id,
           ame.entity_type as person_type,
           coalesce(ame.student_id, ame.employee_id) as person_id,
           de.tapped_at
    from day_events de
    join attendance_machine_enrollments ame
      on ame.school_id = de.school_id
     and ame.machine_id = de.machine_id
     and ame.machine_user_id = de.machine_user_id
     and ame.linked_at is not null
     and de.tapped_at >= ame.linked_at
     and (ame.unlinked_at is null or de.tapped_at < ame.unlinked_at)
    where de.source = 'agent'
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
end $$;

revoke execute on function public._reconcile_attendance_pair(uuid, date) from public, anon, authenticated;
