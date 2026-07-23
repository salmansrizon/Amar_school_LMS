-- Rename the employee-side Shift concept to Office Time (issue #102, map #91).
--
-- Grilling decision 2: the word "Shift" leaves the product entirely. The
-- BEHAVIOUR is unchanged — this is a rename, not a redesign. Late/early
-- detection, the grace MAX-rule and RFID reconciliation must produce
-- identical statuses before and after.
--
-- `main` is pre-launch (grilling decision 3), so this applies directly to the
-- shared database: no promotion window, no compat view, no expand/contract.

alter table public.shifts rename to office_times;
alter table public.employee_shifts rename to employee_office_times;
alter table public.employee_office_times rename column shift_id to office_time_id;

-- Policy names carry the word too.
alter policy "school members manage shifts" on public.office_times rename to "school members manage office times";
alter policy "super admin manages shifts" on public.office_times rename to "super admin manages office times";
alter policy "super admin manages employee shifts" on public.employee_office_times rename to "super admin manages employee office times";

-- Function bodies are text, so every reader of the old names is recreated
-- rather than renamed.
drop policy if exists "school members manage employee shifts" on public.employee_office_times;
drop function if exists public.shift_in_my_school(uuid);

create function public.office_time_in_my_school(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from office_times where id = oid and school_id = public.app_current_school_id()
  )
$$;

create policy "school members manage employee office times" on public.employee_office_times
  for all using (
    public.employee_in_my_school(employee_id) and public.office_time_in_my_school(office_time_id)
  );

-- Grace MAX-rule (0012/0013): unchanged arithmetic, new table names.
create or replace function public.effective_grace_for_my_school()
returns table(employee_id uuid, grace integer)
language sql stable security definer set search_path = public as $$
  select e.id,
         greatest(
           coalesce(s.default_grace_minutes, 0),
           coalesce(c.grace_minutes, 0),
           coalesce(e.grace_override_minutes, 0),
           coalesce((
             select max(ot.grace_minutes)
             from employee_office_times eot join office_times ot on ot.id = eot.office_time_id
             where eot.employee_id = e.id
           ), 0)
         )
  from employees e
  join schools s on s.id = e.school_id
  left join category_grace_minutes c
    on c.school_id = e.school_id and c.category = e.category
  where e.school_id = public.app_current_school_id()
$$;

create or replace function public.effective_grace_minutes(emp uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.employee_in_my_school(emp)
     and public.app_current_role() is distinct from 'super_admin' then
    raise exception 'employee not accessible';
  end if;

  return (
    select coalesce(max(v), 0) from (
      select s.default_grace_minutes as v
      from employees e join schools s on s.id = e.school_id
      where e.id = emp
      union all
      select c.grace_minutes
      from employees e join category_grace_minutes c
        on c.school_id = e.school_id and c.category = e.category
      where e.id = emp
      union all
      select ot.grace_minutes
      from employee_office_times eot join office_times ot on ot.id = eot.office_time_id
      where eot.employee_id = emp
      union all
      select e.grace_override_minutes from employees e where e.id = emp
    ) levels
  );
end $$;

-- RFID reconciliation (0017/0020) — the riskiest surface. Same statuses, same
-- MAX-rule, same earliest-tap-is-entry collapse; only the names move.
CREATE OR REPLACE FUNCTION public.reconcile_attendance(job_secret text, target_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
               select s2.default_grace_minutes as v from employees e2
                 join schools s2 on s2.id = e2.school_id where e2.id = c.person_id
               union all
               select cg.grace_minutes from employees e2
                 join category_grace_minutes cg
                   on cg.school_id = e2.school_id and cg.category = e2.category
                 where e2.id = c.person_id
               union all
               select ot.grace_minutes from employee_office_times eot
                 join office_times ot on ot.id = eot.office_time_id where eot.employee_id = c.person_id
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
end $function$
;
