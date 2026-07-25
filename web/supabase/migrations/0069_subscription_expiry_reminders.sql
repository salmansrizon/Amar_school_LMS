-- 0069_subscription_expiry_reminders.sql
-- Push side of subscription expiry (map #158, ticket #163): a daily sweep warns
-- an owner 7 days before their subscription lapses, via SMS + an owner
-- activity-feed row (a school notice). This migration adds the per-day dedupe
-- ledger + the two job-secret-gated RPCs the cron route calls. It does NOT set
-- deactivated_at on expiry — expiry gating is computed on read (#169); the hard
-- block stays a manual super-admin switch (#161).

-- One row per (school, expiry window) reminded — the idempotency key, so a
-- re-run on the same day never double-sends.
create table public.subscription_expiry_reminders (
  school_id uuid not null references public.schools (id) on delete cascade,
  expires_on date not null,
  reminded_at timestamptz not null default now(),
  primary key (school_id, expires_on)
);

alter table public.subscription_expiry_reminders enable row level security;

-- Super-admin may inspect the ledger; the cron writes via the RPC below.
create policy "super admin reads expiry reminders" on public.subscription_expiry_reminders
  for select using (public.app_current_role() = 'super_admin');

-- Candidates: schools whose subscription lapses within the next 7 days
-- (target_date+1 .. target_date+7) and that have not been reminded for that
-- expiry yet. A window rather than exact `= +7` so a single skipped cron day
-- still catches the school before it lapses; the (school_id, expires_on) dedupe
-- ledger keeps it to one reminder regardless. Blocked schools are skipped (their
-- access is already denied). Owner id + the school's registered mobile ride
-- along for the SMS + activity row.
create function public.subscription_reminder_candidates(job_secret text, target_date date)
  returns table (school_id uuid, school_name text, owner_id uuid, phone text, expires_on date)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;
  return query
    select s.id, s.name,
           (select p.id from profiles p where p.school_id = s.id and p.role = 'school_owner' limit 1),
           s.mobile,
           s.subscription_expires_at
    from schools s
    where s.subscription_expires_at between target_date + 1 and target_date + 7
      and s.deactivated_at is null
      and not exists (
        select 1 from subscription_expiry_reminders r
        where r.school_id = s.id and r.expires_on = s.subscription_expires_at
      );
end $$;

-- Record a reminder: claim the dedupe row (returns false if already reminded)
-- and, when newly claimed and an owner exists, drop an activity-feed notice for
-- that owner. The cron sends the SMS only when this returns true.
create function public.record_subscription_reminder(
  job_secret text,
  p_school uuid,
  p_expires_on date,
  p_owner uuid,
  p_title text,
  p_body text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  claimed int;
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  insert into subscription_expiry_reminders (school_id, expires_on)
  values (p_school, p_expires_on)
  on conflict (school_id, expires_on) do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return false; -- already reminded for this expiry window
  end if;

  if p_owner is not null then
    insert into publications (school_id, kind, title, content, importance, target_type, created_by)
    values (p_school, 'notice', p_title, p_body, 'important', 'all', p_owner);
  end if;
  return true;
end $$;

revoke execute on function public.subscription_reminder_candidates(text, date) from public;
revoke execute on function public.record_subscription_reminder(text, uuid, date, uuid, text, text) from public;
grant execute on function public.subscription_reminder_candidates(text, date) to anon, authenticated;
grant execute on function public.record_subscription_reminder(text, uuid, date, uuid, text, text) to anon, authenticated;
