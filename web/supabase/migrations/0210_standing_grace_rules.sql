-- 0210_standing_grace_rules.sql
-- Standing Grace Rules (issue #673, ADR 0032): replaces the School default
-- grace, per-Category grace and Prayer & Tiffin Window (migration 0208) with
-- one shape -- a Grace Detail (fixed, code-owned list in web/lib/grace.ts),
-- a Shift, one or more Employee Categories, and a number of minutes. Unique
-- per (School, Shift, Grace Detail). Ad-Hoc Grace Exemptions gain a Shift.
--
-- A rule's Shift is display-only (ADR 0032): it groups and filters rules on
-- the Grace Time screen, never narrows which Employees a rule applies to.
-- The MAX-rule SQL below therefore joins on Category alone.
--
-- Existing default/category/Prayer & Tiffin values are dropped, not
-- migrated (grilled on #673): RFID is disabled School-wide, so no
-- observable behavior depends on them, and mapping Shift-less rows onto a
-- Shift would be a guess.

create table public.standing_grace_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  shift text
    check (shift is null or shift = any (array['Morning', 'Day', 'Evening', 'Night'])),
  grace_detail text not null,
  grace_minutes int not null check (grace_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standing_grace_rules_identity_unique
    unique nulls not distinct (school_id, shift, grace_detail)
);

create index standing_grace_rules_school_idx on public.standing_grace_rules (school_id);

-- Same "one row per Category, join through the parent" shape as
-- ad_hoc_grace_exemption_categories (0208).
create table public.standing_grace_rule_categories (
  rule_id uuid not null references public.standing_grace_rules (id) on delete cascade,
  category text not null references public.employee_categories (name),
  primary key (rule_id, category)
);

alter table public.standing_grace_rules enable row level security;
alter table public.standing_grace_rule_categories enable row level security;

create policy "school members manage standing_grace_rules" on public.standing_grace_rules
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages standing_grace_rules" on public.standing_grace_rules
  for all using (public.app_current_role() = 'super_admin');

create policy "school members manage standing_grace_rule_categories" on public.standing_grace_rule_categories
  for all using (
    exists (
      select 1 from public.standing_grace_rules r
      where r.id = rule_id and r.school_id = public.app_current_school_id()
    )
  );
create policy "super admin manages standing_grace_rule_categories" on public.standing_grace_rule_categories
  for all using (public.app_current_role() = 'super_admin');

comment on table public.standing_grace_rules is
  'A named, always-in-force Considerable Grace Window allowance (issue #673): '
  'Grace Detail + Shift + minutes, applying to every Employee in one of its '
  'standing_grace_rule_categories rows. Shift is display-only (ADR 0032).';

-- Create-or-replace in one statement, so a re-save of an existing
-- (Shift, Grace Detail) never leaves the rule with a half-replaced Category
-- set. security invoker: RLS above scopes every read/write to the caller's
-- School, exactly as the table-level writes would.
create or replace function public.save_standing_grace_rule(
  p_shift text,
  p_grace_detail text,
  p_grace_minutes int,
  p_categories text[]
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  rid uuid;
begin
  if coalesce(array_length(p_categories, 1), 0) = 0 then
    raise exception 'at least one category is required';
  end if;

  insert into standing_grace_rules (shift, grace_detail, grace_minutes)
  values (p_shift, p_grace_detail, p_grace_minutes)
  on conflict on constraint standing_grace_rules_identity_unique
  do update set grace_minutes = excluded.grace_minutes, updated_at = now()
  returning id into rid;

  delete from standing_grace_rule_categories where rule_id = rid;
  insert into standing_grace_rule_categories (rule_id, category)
  select rid, c from unnest(p_categories) as c group by c;

  return rid;
end $$;

revoke execute on function public.save_standing_grace_rule(text, text, int, text[]) from anon, public;
grant execute on function public.save_standing_grace_rule(text, text, int, text[]) to authenticated;

-- Ad-Hoc Grace Exemption Shift: display-only, same meaning as above.
alter table public.ad_hoc_grace_exemptions
  add column shift text
    check (shift is null or shift = any (array['Morning', 'Day', 'Evening', 'Night']));

-- Retire the old levels. Both SQL MAX-rule functions below are rewritten
-- first-class here; nothing else reads these (0208 was their last writer).
drop function if exists public.set_school_default_grace(integer);
drop table public.category_grace_minutes;
alter table public.schools drop column default_grace_minutes;

create or replace function public.effective_grace_for_my_school()
returns table(employee_id uuid, grace integer)
language sql stable security definer set search_path = public as $$
  select e.id,
         coalesce((
           select max(r.grace_minutes)
           from standing_grace_rules r
           join standing_grace_rule_categories rc on rc.rule_id = r.id
           where r.school_id = e.school_id and rc.category = e.category
         ), 0)
  from employees e
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
    select coalesce(max(r.grace_minutes), 0)
    from employees e
    join standing_grace_rule_categories rc on rc.category = e.category
    join standing_grace_rules r on r.id = rc.rule_id and r.school_id = e.school_id
    where e.id = emp
  );
end $$;

-- RFID reconciliation: identical to 0208 except the grace CTE, whose
-- standing candidates are now Standing Grace Rules (by Category, any Shift).
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
end $function$
;
