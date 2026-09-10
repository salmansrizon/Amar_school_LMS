-- 0199_school_academic_years.sql
-- Wayfinder map #609, ticket #610. Builds on start_academic_year (0194, #594).
--
-- schools.active_academic_year (0175/0194) is a single forward-only *cursor*:
-- it remembers only the year a School is on right now, never the years it has
-- passed through. #609 needs the latter as a first-class fact -- which
-- Academic Years a School has actually *started* -- to drive the Visible Years
-- selector, the shared " -- {year}" Offering label, and the copy-forward
-- source-year picker. None of those may infer a started year from
-- class_offerings: an Offering row can carry an academic_year that was never
-- formally started (a stray import, a hand-set value), and inferring would
-- surface it as if the School had run that year.
--
-- Shape and RLS mirror student_enrollments (0177): a school_id-scoped SELECT
-- policy for members, a super_admin catch-all, and NO insert/update/delete
-- policy for `authenticated` at all -- the sole writer is start_academic_year,
-- whose SECURITY DEFINER context bypasses RLS. Unlike schools.active_academic_year
-- (0194) this needs no transition-only trigger: with no write policy every
-- PostgREST insert/update/delete is already refused outright, and the table is
-- append-only by construction -- start_academic_year only ever inserts, on
-- conflict do nothing.

create table public.school_academic_years (
  school_id uuid not null references public.schools (id) on delete cascade,
  -- Same 2000-2100 bound schools.active_academic_year's own CHECK carries (0175).
  academic_year int not null check (academic_year between 2000 and 2100),
  started_at timestamptz not null default now(),
  primary key (school_id, academic_year)
);

create index school_academic_years_school_idx on public.school_academic_years (school_id);

alter table public.school_academic_years enable row level security;

create policy "school members read school academic years" on public.school_academic_years
  for select using (school_id = (select public.app_current_school_id()));

create policy "super admin manages school academic years" on public.school_academic_years
  for all using (public.app_current_role() = 'super_admin');

comment on table public.school_academic_years is
  'The record of which Academic Years a School has actually started (issue '
  '#570/#594, map #609). One row per (school, year); schools.active_academic_year '
  'stays the single current-year cursor and this table is its history. Written '
  'only by start_academic_year -- there is no INSERT/UPDATE/DELETE policy for '
  'authenticated. Started years are never inferred from class_offerings.';

-- Backfill. Every year each School has demonstrably been on:
--   * its current schools.active_academic_year, and
--   * every numeric active_academic_year value seen on either side of a
--     recorded 'school'/'configure' transition. start_academic_year (0194)
--     writes both audit_log.before and audit_log.after as
--     {"active_academic_year": N}; other settings-style 'configure' rows
--     (set_feature_state, 0081, and friends) carry no such key, so
--     ->>'active_academic_year' is null for them and they drop out.
-- started_at is taken from the audit row that first advanced *into* a year
-- where one exists, else now(). class_offerings is deliberately not consulted.
insert into public.school_academic_years (school_id, academic_year, started_at)
select y.school_id, y.academic_year, coalesce(min(y.at), now())
from (
  select s.id as school_id,
         s.active_academic_year::bigint as academic_year,
         null::timestamptz as at
  from public.schools s
  where s.active_academic_year is not null
  union all
  select a.school_id,
         (a.after ->> 'active_academic_year')::bigint as academic_year,
         a.created_at as at
  from public.audit_log a
  where a.entity_type = 'school'
    and a.action = 'configure'
    and a.school_id is not null
    and a.after ->> 'active_academic_year' ~ '^\d+$'
  union all
  select a.school_id,
         (a.before ->> 'active_academic_year')::bigint as academic_year,
         null::timestamptz as at
  from public.audit_log a
  where a.entity_type = 'school'
    and a.action = 'configure'
    and a.school_id is not null
    and a.before ->> 'active_academic_year' ~ '^\d+$'
) y
where y.academic_year between 2000 and 2100
group by y.school_id, y.academic_year
on conflict (school_id, academic_year) do nothing;

-- start_academic_year gains one responsibility: the same transaction that
-- advances the cursor also records both the year it left and the year it
-- entered in school_academic_years. Everything else -- the row lock, the
-- inline School Owner check, the 2000-2100 bound, the forward-only rule, the
-- transition-only GUC, the pointer UPDATE, the audit_log write, the return
-- value -- is byte-for-byte the 0194 body. Recording the prior year (not just
-- p_year) keeps a School created *after* this migration consistent with one
-- backfilled by it: a fresh School's active_academic_year comes from the 0182
-- column default with no history row of its own, so the first start would
-- otherwise leave a gap where the year it was already running should be.
create or replace function public.start_academic_year(p_year int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_school schools%rowtype;
begin
  select * into v_school
  from schools
  where id = public.app_current_school_id()
  for update;
  if not found then
    raise exception 'school not accessible';
  end if;

  if public.app_current_role() is distinct from 'school_owner' then
    raise exception 'not authorized -- School Owner only';
  end if;

  if p_year < 2000 or p_year > 2100 then
    raise exception 'academic year must be between 2000 and 2100';
  end if;

  if v_school.active_academic_year is not null and p_year <= v_school.active_academic_year then
    raise exception 'academic year must be greater than the current active academic year (%)', v_school.active_academic_year;
  end if;

  perform set_config('app.academic_year_transition_in_progress', 'true', true);
  update schools set active_academic_year = p_year where id = v_school.id;

  -- #609/#610: record the transition in the started-years history, in this
  -- same transaction. on conflict do nothing -> a re-run, or a race with the
  -- migration backfill, is a harmless no-op.
  insert into public.school_academic_years (school_id, academic_year)
  values (v_school.id, p_year)
  on conflict (school_id, academic_year) do nothing;
  if v_school.active_academic_year is not null then
    insert into public.school_academic_years (school_id, academic_year)
    values (v_school.id, v_school.active_academic_year)
    on conflict (school_id, academic_year) do nothing;
  end if;

  perform public.record_audit(
    'school', v_school.id::text, 'configure',
    v_school.id, null,
    jsonb_build_object('active_academic_year', v_school.active_academic_year),
    jsonb_build_object('active_academic_year', p_year)
  );

  return p_year;
end;
$$;

revoke execute on function public.start_academic_year(int) from anon, public;
grant execute on function public.start_academic_year(int) to authenticated;

comment on function public.start_academic_year(int) is
  'The "Start Academic Year N" named domain action (issue #570, #594): '
  'atomically advances the calling School''s active_academic_year (School '
  'Owner only, forward-only), records the year left and the year entered in '
  'school_academic_years (#609), and records the transition in audit_log. Pure '
  'pointer flip -- does not touch class_offerings, student_enrollments, or '
  'any other row; new Class Offerings pick up the new value on their own '
  'next creation via addClass''s existing default.';
