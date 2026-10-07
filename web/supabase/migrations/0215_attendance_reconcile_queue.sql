-- Machine Attendance, Phase 3 slice 1 (Architecture Baseline v1.1 §15.2.1, §21):
-- reconciliation by (School, School-local day), scheduled through
-- attendance_reconcile_dates (0214).
--
--   reconcile_attendance(job_secret, target_school, target_date)   per-pair reconcile (new overload)
--   drain_attendance_reconcile_queue(job_secret, max_pairs, only_school)
--   claim_attendance_reconcile_dates / complete_attendance_reconcile_date
--                                   the drain's two halves, for a worker that
--                                   claims and completes in separate transactions
--   enqueue_attendance_reconcile_dates(job_secret, target_date, target_school)
--                                   manual backfill (?date= on the reconcile route)
--   ingest_attendance_events        replaced: also re-pends every touched pair
--   set_automatic_attendance_enabled replaced: re-enabling re-pends the School's due pairs
--
-- Expand-only: the two-argument reconcile_attendance(job_secret, target_date)
-- that deployed code on main still calls is left exactly as 0211 defined it.
-- Its business rules are also those of the per-pair form below; only the
-- selection of taps changes (School + local day instead of one UTC day).

-- ---------------------------------------------------------------------------
-- Internal: per-pair reconcile without the secret check (callers check it).
--
-- The body is 0211's reconcile_attendance with one change: day_events selects
-- the pair's School and School-local attendance_date instead of a global UTC
-- day. Resolution, merge (least/greatest with the existing record), status
-- rules, grace, the automatic-attendance gate and "consume only resolved taps"
-- are unchanged.
create function public._reconcile_attendance_pair(target_school uuid, target_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  upserted int;
begin
  -- One reconcile per pair at a time: two concurrent runs could otherwise each
  -- merge from their own snapshot and the later commit narrow the window.
  perform pg_advisory_xact_lock(hashtextextended('attendance_reconcile:' || target_school::text || ':' || target_date::text, 0));

  with day_events as (
    select ae.school_id, ae.card_number, ae.tapped_at, ae.id
    from attendance_events ae
    join schools s on s.id = ae.school_id and s.automatic_attendance_enabled
    where not ae.processed
      and ae.school_id = target_school
      and ae.attendance_date = target_date
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
end $$;

revoke execute on function public._reconcile_attendance_pair(uuid, date) from public, anon, authenticated;

-- Internal: mark pairs due. Every enqueue re-pends the pair and bumps
-- requested_at, whatever its current status.
create function public._enqueue_attendance_reconcile_dates(pairs jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into attendance_reconcile_dates as q (school_id, attendance_date, status, requested_at)
  select distinct (p ->> 'school_id')::uuid, (p ->> 'attendance_date')::date, 'pending', clock_timestamp()
    from jsonb_array_elements(pairs) p
  on conflict (school_id, attendance_date) do update
    set status = 'pending', requested_at = excluded.requested_at;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public._enqueue_attendance_reconcile_dates(jsonb) from public, anon, authenticated;

-- Internal: claim up to max_pairs due pairs, oldest request first. A claim
-- left 'processing' for 15 minutes (a crashed drain) is due again.
create function public._claim_attendance_reconcile_dates(max_pairs int, only_school uuid)
returns table (school_id uuid, attendance_date date, claimed_at timestamptz)
language sql security definer set search_path = public as $$
  with picked as (
    select q.school_id, q.attendance_date
      from attendance_reconcile_dates q
     where (q.status = 'pending'
            or (q.status = 'processing' and q.claimed_at < clock_timestamp() - interval '15 minutes'))
       and (only_school is null or q.school_id = only_school)
     order by q.requested_at
     limit max_pairs
       for update skip locked
  )
  update attendance_reconcile_dates q
     set status = 'processing', claimed_at = clock_timestamp(), attempts = q.attempts + 1
    from picked
   where q.school_id = picked.school_id and q.attendance_date = picked.attendance_date
  returning q.school_id, q.attendance_date, q.claimed_at;
$$;

revoke execute on function public._claim_attendance_reconcile_dates(int, uuid) from public, anon, authenticated;

-- Internal: finish a claim. The outcome only sticks when no request arrived
-- after the claim; otherwise the pair goes (or stays) 'pending'. Returns the
-- final status, or 'stale' when the claim was superseded by a newer one.
create function public._complete_attendance_reconcile_date(
  target_school uuid, target_date date, claimed_at_token timestamptz, outcome text, error text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  final_status text;
begin
  if outcome not in ('done', 'skipped', 'pending') then
    raise exception 'invalid outcome %', outcome;
  end if;
  update attendance_reconcile_dates q
     set status = case when q.requested_at > claimed_at_token then 'pending' else outcome end,
         last_run_at = clock_timestamp(),
         last_error = error
   where q.school_id = target_school
     and q.attendance_date = target_date
     and q.claimed_at = claimed_at_token
  returning q.status into final_status;
  return coalesce(final_status, 'stale');
end $$;

revoke execute on function public._complete_attendance_reconcile_date(uuid, date, timestamptz, text, text) from public, anon, authenticated;

create function public._check_reconcile_secret(job_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;
end $$;

revoke execute on function public._check_reconcile_secret(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public, secret-gated (the same vendor_secrets 'reconcile' secret the
-- two-argument reconcile_attendance checks; callable without a session).

create function public.reconcile_attendance(job_secret text, target_school uuid, target_date date)
returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_reconcile_secret(job_secret);
  return public._reconcile_attendance_pair(target_school, target_date);
end $$;

revoke execute on function public.reconcile_attendance(text, uuid, date) from public;
grant execute on function public.reconcile_attendance(text, uuid, date) to anon, authenticated;

create function public.claim_attendance_reconcile_dates(job_secret text, max_pairs int, only_school uuid default null)
returns table (school_id uuid, attendance_date date, claimed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_reconcile_secret(job_secret);
  if max_pairs is null or max_pairs < 1 or max_pairs > 1000 then
    raise exception 'max_pairs must be between 1 and 1000';
  end if;
  return query select * from public._claim_attendance_reconcile_dates(max_pairs, only_school);
end $$;

revoke execute on function public.claim_attendance_reconcile_dates(text, int, uuid) from public;
grant execute on function public.claim_attendance_reconcile_dates(text, int, uuid) to anon, authenticated;

create function public.complete_attendance_reconcile_date(
  job_secret text, target_school uuid, target_date date, claimed_at_token timestamptz, outcome text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_reconcile_secret(job_secret);
  return public._complete_attendance_reconcile_date(target_school, target_date, claimed_at_token, outcome, null);
end $$;

revoke execute on function public.complete_attendance_reconcile_date(text, uuid, date, timestamptz, text) from public;
grant execute on function public.complete_attendance_reconcile_date(text, uuid, date, timestamptz, text) to anon, authenticated;

-- The cron entry point. Claims up to max_pairs due pairs and reconciles each:
-- automatic attendance off => 'skipped'; success => 'done' (or back to
-- 'pending' if re-requested meanwhile); an error in one pair is recorded on
-- that pair (left 'pending' with last_error) without aborting the others.
-- only_school limits the drain to one School (manual runs, tests).
create function public.drain_attendance_reconcile_queue(job_secret text, max_pairs int default 200, only_school uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p record;
  final_status text;
  n_claimed int := 0;
  n_done int := 0;
  n_skipped int := 0;
  n_repended int := 0;
  n_failed int := 0;
  n_upserted int := 0;
begin
  perform public._check_reconcile_secret(job_secret);
  if max_pairs is null or max_pairs < 1 or max_pairs > 1000 then
    raise exception 'max_pairs must be between 1 and 1000';
  end if;

  for p in select * from public._claim_attendance_reconcile_dates(max_pairs, only_school) loop
    n_claimed := n_claimed + 1;
    if not exists (select 1 from schools s where s.id = p.school_id and s.automatic_attendance_enabled) then
      final_status := public._complete_attendance_reconcile_date(p.school_id, p.attendance_date, p.claimed_at, 'skipped', null);
    else
      begin
        n_upserted := n_upserted + public._reconcile_attendance_pair(p.school_id, p.attendance_date);
        final_status := public._complete_attendance_reconcile_date(p.school_id, p.attendance_date, p.claimed_at, 'done', null);
      exception when others then
        n_failed := n_failed + 1;
        final_status := public._complete_attendance_reconcile_date(p.school_id, p.attendance_date, p.claimed_at, 'pending', sqlerrm);
        continue;
      end;
    end if;
    if final_status = 'done' then
      n_done := n_done + 1;
    elsif final_status = 'skipped' then
      n_skipped := n_skipped + 1;
    elsif final_status = 'pending' then
      n_repended := n_repended + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'claimed', n_claimed, 'done', n_done, 'skipped', n_skipped,
    'repended', n_repended, 'failed', n_failed, 'upserted', n_upserted);
end $$;

revoke execute on function public.drain_attendance_reconcile_queue(text, int, uuid) from public;
grant execute on function public.drain_attendance_reconcile_queue(text, int, uuid) to anon, authenticated;

-- Manual backfill: mark target_date due for every School that has taps on that
-- local day (or only target_school, which is enqueued even without taps).
create function public.enqueue_attendance_reconcile_dates(job_secret text, target_date date, target_school uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_reconcile_secret(job_secret);
  return public._enqueue_attendance_reconcile_dates(coalesce((
    select jsonb_agg(jsonb_build_object('school_id', sid, 'attendance_date', target_date))
      from (
        select distinct ae.school_id as sid
          from attendance_events ae
         where ae.attendance_date = target_date
           and (target_school is null or ae.school_id = target_school)
        union
        select target_school where target_school is not null
      ) schools_due
  ), '[]'::jsonb));
end $$;

revoke execute on function public.enqueue_attendance_reconcile_dates(text, date, uuid) from public;
grant execute on function public.enqueue_attendance_reconcile_dates(text, date, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Legacy ingest, replaced: same token gate, same validation, same card-only
-- insert and return value (rows inserted; duplicates are still inserted).
-- New: attendance_date is set in the School's time zone, and every distinct
-- (School, day) the batch touched is re-pended — including pairs whose taps
-- were all duplicates or that lie days in the past.
create or replace function public.ingest_attendance_events(school uuid, token uuid, events jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  inserted int;
  tz text;
  touched jsonb;
begin
  select s.time_zone into tz from schools s where s.id = school and s.ingest_token = token;
  if tz is null then
    raise exception 'invalid ingest token';
  end if;
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events) = 0 then
    raise exception 'events must be a non-empty array';
  end if;
  if jsonb_array_length(events) > 5000 then
    raise exception 'batch too large';
  end if;

  with valid as (
    select e ->> 'card_number' as card_number,
           public.safe_timestamptz(e ->> 'tapped_at') as tapped_at
      from jsonb_array_elements(events) e
     where coalesce(e ->> 'card_number', '') <> ''
  ),
  ins as (
    insert into attendance_events (school_id, card_number, tapped_at, attendance_date)
    select school, v.card_number, v.tapped_at, (v.tapped_at at time zone tz)::date
      from valid v
     where v.tapped_at is not null
    returning attendance_date
  )
  select count(*)::int,
         coalesce(jsonb_agg(distinct jsonb_build_object('school_id', school, 'attendance_date', ins.attendance_date)), '[]'::jsonb)
    into inserted, touched
    from ins;

  perform public._enqueue_attendance_reconcile_dates(touched);
  return inserted;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic-attendance toggle, replaced: same caller rule and update. New:
-- switching it back ON re-pends every pair of this School that still has
-- unprocessed taps or was skipped while it was off, so the next drain
-- reconciles them.
create or replace function public.set_automatic_attendance_enabled(enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.app_current_school_id();
  was_enabled boolean;
begin
  if public.app_current_role() not in ('school_owner', 'staff_user') then
    raise exception 'school members only';
  end if;
  select s.automatic_attendance_enabled into was_enabled from schools s where s.id = sid for update;
  update schools set automatic_attendance_enabled = enabled
  where id = sid;

  if enabled and was_enabled is false then
    perform public._enqueue_attendance_reconcile_dates(coalesce((
      select jsonb_agg(jsonb_build_object('school_id', sid, 'attendance_date', d))
        from (
          select distinct ae.attendance_date as d
            from attendance_events ae
           where ae.school_id = sid and not ae.processed
          union
          select q.attendance_date
            from attendance_reconcile_dates q
           where q.school_id = sid and q.status = 'skipped'
        ) due
    ), '[]'::jsonb));
  end if;
end $$;
