-- 0208_grace_time_redesign.sql
-- Grace Time redesign (issue #671, ADR 0030): retires per-Employee Office
-- Time as a live attendance input and replaces it with two new,
-- Employee-Category-based (never per-individual) levels in the Considerable
-- Grace Window's MAX rule -- a Prayer & Tiffin Window (a Category's own
-- standing extension) and an Ad-Hoc Grace Exemption (a dated, one-off
-- addition for one or more Categories).
--
-- Office Time's start/end (office_times.starts_at/ends_at via
-- employee_office_times) was independently load-bearing for
-- resolveEmployeeDisplayStatus/reconcile_attendance's late/early-exit check,
-- not just a grace input -- see ADR 0030 for why this migration accepts that
-- check going dark (always "present") rather than replacing it. office_times/
-- employee_office_times stay in schema, unused, since reconcile_attendance's
-- SQL still structurally joins them.

-- Prayer & Tiffin Window: a second, separately labeled number alongside a
-- Category's plain grace value (school_id, category) -- not merged into it,
-- so the UI can show *why* a Category has extra grace.
alter table public.category_grace_minutes
  add column prayer_tiffin_minutes int check (prayer_tiffin_minutes is null or prayer_tiffin_minutes >= 0);

-- Ad-Hoc Grace Exemption: a dated, one-off addition to the MAX rule, active
-- only on its own date, for every Employee currently in one of its selected
-- Categories. Distinct from Leave (per-person, requested, approved) and from
-- a dated Off-Day (school-wide) -- this is per-Category, stated as fact, no
-- requester or approval step.
create table public.ad_hoc_grace_exemptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  exemption_date date not null,
  details text,
  duration_minutes int not null check (duration_minutes >= 0),
  created_at timestamptz not null default now()
);

create index ad_hoc_grace_exemptions_school_date_idx
  on public.ad_hoc_grace_exemptions (school_id, exemption_date);

-- One row per Category an exemption applies to -- "single or multiple
-- categories" from a single dated exemption event. FK's to employee_categories
-- (issue #666) for real referential integrity, the same anchor
-- category_grace_minutes/category_office_hours/employees.category use.
create table public.ad_hoc_grace_exemption_categories (
  exemption_id uuid not null references public.ad_hoc_grace_exemptions (id) on delete cascade,
  category text not null references public.employee_categories (name),
  primary key (exemption_id, category)
);

alter table public.ad_hoc_grace_exemptions enable row level security;
alter table public.ad_hoc_grace_exemption_categories enable row level security;

create policy "school members manage ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages ad_hoc_grace_exemptions" on public.ad_hoc_grace_exemptions
  for all using (public.app_current_role() = 'super_admin');

-- No school_id of its own -- scoped through its exemption's school_id, the
-- same "join through the parent" shape as other single-purpose join tables
-- in this schema (e.g. employee_academic_shifts via employee_in_my_school).
create policy "school members manage ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories
  for all using (
    exists (
      select 1 from public.ad_hoc_grace_exemptions e
      where e.id = exemption_id and e.school_id = public.app_current_school_id()
    )
  );
create policy "super admin manages ad_hoc_grace_exemption_categories" on public.ad_hoc_grace_exemption_categories
  for all using (public.app_current_role() = 'super_admin');

comment on table public.ad_hoc_grace_exemptions is
  'A dated, one-off Considerable Grace Window addition (issue #671): a '
  'duration and reason for one specific date, applying to every Employee in '
  'one of its ad_hoc_grace_exemption_categories rows. Not a standing rule '
  '(compare category_grace_minutes) and not per-person/approved (compare '
  'employee_leaves) -- per-Category, stated as fact, for one day.';

-- Retire per-Employee Office Time as a live input (ADR 0030): clear existing
-- assignments and overrides rather than leaving them invisible/unmanageable
-- once their admin UI is removed. office_times/employee_office_times are not
-- dropped -- reconcile_attendance's SQL still joins them structurally.
delete from public.employee_office_times;
update public.employees set grace_override_minutes = null where grace_override_minutes is not null;

-- Grace MAX-rule (0012/0013/0061), redesigned: Office Time and the
-- individual override are dropped as candidates; Prayer & Tiffin Window
-- (Category-based) takes their place. No Ad-Hoc Grace Exemption here --
-- this function has no date argument to scope one against.
create or replace function public.effective_grace_for_my_school()
returns table(employee_id uuid, grace integer)
language sql stable security definer set search_path = public as $$
  select e.id,
         greatest(
           coalesce(s.default_grace_minutes, 0),
           coalesce(c.grace_minutes, 0),
           coalesce(c.prayer_tiffin_minutes, 0)
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
      select c.prayer_tiffin_minutes
      from employees e join category_grace_minutes c
        on c.school_id = e.school_id and c.category = e.category
      where e.id = emp
    ) levels
  );
end $$;

-- RFID reconciliation (0017/0020/0061): same office_start/office_end
-- computation (now always null with employee_office_times empty -- see ADR
-- 0030, accepted), same MAX-rule shape, Office Time/individual-override
-- candidates dropped, Prayer & Tiffin Window and Ad-Hoc Grace Exemption
-- (matched against target_date, the date being reconciled) added.
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
               select cg.prayer_tiffin_minutes from employees e2
                 join category_grace_minutes cg
                   on cg.school_id = e2.school_id and cg.category = e2.category
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
end $function$
;
