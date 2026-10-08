-- Machine Attendance, Phase 3 slice 1 (Architecture Baseline v1.1 §15.2.1, §21):
-- the School-local attendance day — schema half. Expand-only: every object here
-- is new or additive, so the code deployed on main (which still calls the
-- two-argument reconcile_attendance and the legacy ingest RPC) keeps working
-- unchanged against the shared database.
--
--   1. schools.time_zone            IANA zone; 'Asia/Dhaka' for every School today
--   2. attendance_events.attendance_date
--                                   the School-local calendar day of each tap,
--                                   filled by trigger on insert, backfilled here
--   3. attendance_reconcile_dates   the reconciliation schedule's source of truth:
--                                   one row per (School, attendance day)
--
-- The functions that use these (per-pair reconcile, queue drain, the replaced
-- ingest and toggle RPCs) are in 0215.

-- ---------------------------------------------------------------------------
-- 1. School time zone.

-- True for a time zone name Postgres can convert with. Names only (letters,
-- '/', '_', '+', '-', digits after the first segment) so a POSIX offset string
-- such as '+06' — whose sign Postgres reads inverted — is never accepted.
create function public.is_valid_time_zone(tz text) returns boolean
language plpgsql immutable as $$
begin
  if tz is null or tz !~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)*$' then
    return false;
  end if;
  perform timezone(tz, timestamptz '2000-01-01 00:00:00+00');
  return true;
exception when others then
  return false;
end $$;

alter table public.schools
  add column time_zone text not null default 'Asia/Dhaka'
    constraint schools_time_zone_valid check (public.is_valid_time_zone(time_zone));

comment on column public.schools.time_zone is
  'IANA time zone of the School. Defines the School-local attendance day (attendance_events.attendance_date).';

-- ---------------------------------------------------------------------------
-- 2. attendance_events.attendance_date.

alter table public.attendance_events add column attendance_date date;

comment on column public.attendance_events.attendance_date is
  'School-local attendance day of the tap. Legacy ingest-token taps: (tapped_at at time zone schools.time_zone)::date.';

-- Fills attendance_date for any writer that does not set it — including code
-- deployed before this migration — so the column can be NOT NULL immediately.
-- A writer that knows better (the future Agent ingest: device_local_time::date)
-- sets it explicitly and the trigger leaves it alone.
create function public.attendance_events_default_attendance_date() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.attendance_date is null then
    select (new.tapped_at at time zone s.time_zone)::date
      into new.attendance_date
      from schools s
     where s.id = new.school_id;
  end if;
  return new;
end $$;

revoke execute on function public.attendance_events_default_attendance_date() from public, anon, authenticated;

create trigger attendance_events_default_attendance_date
  before insert on public.attendance_events
  for each row execute function public.attendance_events_default_attendance_date();

update public.attendance_events ae
   set attendance_date = (ae.tapped_at at time zone s.time_zone)::date
  from public.schools s
 where s.id = ae.school_id
   and ae.attendance_date is null;

alter table public.attendance_events alter column attendance_date set not null;

-- Reconciliation now selects a School's unprocessed taps by local day. The old
-- (school_id, tapped_at) index stays for the two-argument reconcile still
-- called by deployed code; it is dropped in a later contract step.
create index attendance_events_school_local_date_idx
  on public.attendance_events (school_id, attendance_date) where not processed;

-- ---------------------------------------------------------------------------
-- 3. attendance_reconcile_dates — which (School, day) pairs need reconciling.
--
-- Every ingest upserts its pairs back to 'pending' with a fresh requested_at
-- (even when every tap in the batch was a duplicate). The drain claims pending
-- pairs (status 'processing', claimed_at), reconciles them, and marks a pair
-- 'done' only if no request arrived after its claim — otherwise it stays
-- 'pending' for the next drain, so a tap landing mid-run is never lost.
-- Pairs of a School with automatic attendance switched off become 'skipped'.
create table public.attendance_reconcile_dates (
  school_id uuid not null references public.schools (id) on delete cascade,
  attendance_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'skipped')),
  requested_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  attempts int not null default 0,
  last_run_at timestamptz,
  last_error text,
  primary key (school_id, attendance_date)
);

create index attendance_reconcile_dates_pending_idx
  on public.attendance_reconcile_dates (requested_at) where status = 'pending';

alter table public.attendance_reconcile_dates enable row level security;

-- Read-only for diagnostics; every write goes through the definer RPCs in 0215.
create policy "school members read reconcile dates" on public.attendance_reconcile_dates
  for select
  using (school_id = public.app_current_school_id() and (select public.app_module_granted('attendance')));

create policy "super admin reads reconcile dates" on public.attendance_reconcile_dates
  for select using (public.app_current_role() = 'super_admin');

-- Backfill: every pair that still has unprocessed taps is due (baseline §21.2).
insert into public.attendance_reconcile_dates (school_id, attendance_date)
select distinct ae.school_id, ae.attendance_date
  from public.attendance_events ae
 where not ae.processed
on conflict (school_id, attendance_date) do nothing;
