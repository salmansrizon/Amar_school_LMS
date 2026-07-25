-- 0074_sms_credit_ledger.sql
-- SMS credit metering (map #171 T6). Prepaid SMS: a super-admin top-up credits a
-- school; each successful send debits its segment count. Balance = sum(delta).
--
-- Enforcement (deny when the balance can't cover a send) is gated per-school by
-- the 'sms_metering' feature flag — OFF by default, so every existing school
-- keeps sending untouched until it is onboarded to prepaid (grill decision b).
-- The debit is recorded regardless of the flag, so balances (and the owner-side
-- display in T9) are accurate from day one; only the blocking is gated.

create table public.sms_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  delta integer not null, -- +credits (topup) / -segments (send)
  reason text not null check (reason in ('topup', 'send', 'adjust')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index sms_credit_ledger_school_idx on public.sms_credit_ledger (school_id);

alter table public.sms_credit_ledger enable row level security;

-- Super-admin: read all + insert top-ups / adjustments (T7 allocation UI).
create policy "super admin reads sms ledger" on public.sms_credit_ledger
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin writes sms ledger" on public.sms_credit_ledger
  for insert with check (public.app_current_role() = 'super_admin');
-- School members: read own school's rows (balance display, T9). Send debits are
-- written through sms_record_debit (SECURITY DEFINER), never inserted directly.
create policy "school reads own sms ledger" on public.sms_credit_ledger
  for select using (school_id = public.app_current_school_id());

-- Internal helpers (NOT granted to callers — invoked only inside the guarded
-- functions below, which run as the definer). Kept internal so a school can't
-- read another school's balance/flag by calling them with an arbitrary sid.
create or replace function public.sms_balance(sid uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from public.sms_credit_ledger where school_id = sid;
$$;

create or replace function public.sms_metering_enforced(sid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_feature_flags
    where school_id = sid and flag_key = 'sms_metering' and enabled
  );
$$;

-- Authorization shared by the two callable functions: the caller must be a
-- super-admin, a member of this very school, or the cron (a valid reconcile
-- secret — the same vendor_secrets gate record_absence_sms uses). No null-role
-- hole: an authenticated user with no school cannot touch another school.
create or replace function public.sms_authorized_for(sid uuid, job_secret text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.app_current_role() = 'super_admin'
    or public.app_current_school_id() = sid
    or (job_secret is not null
        and exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret));
$$;

-- May this school send `segs` segments now? True when enforcement is off, else
-- the balance must cover the segments. NB: check-then-debit is not atomic with
-- sms_record_debit — a concurrent send can overspend into a small negative
-- balance; tolerated for prepaid SMS (top-up clears it).
create or replace function public.sms_can_send(sid uuid, segs integer, job_secret text default null)
  returns boolean
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sms_authorized_for(sid, job_secret) then
    raise exception 'not authorized for this school';
  end if;
  return (not public.sms_metering_enforced(sid)) or public.sms_balance(sid) >= segs;
end;
$$;

-- Record a send debit and return the new balance. Same authorization gate.
create or replace function public.sms_record_debit(sid uuid, segs integer, job_secret text default null)
  returns integer
  language plpgsql security definer set search_path = public as $$
begin
  if not public.sms_authorized_for(sid, job_secret) then
    raise exception 'not authorized for this school';
  end if;
  if segs > 0 then
    insert into public.sms_credit_ledger (school_id, delta, reason) values (sid, -segs, 'send');
  end if;
  return public.sms_balance(sid);
end;
$$;

-- Lock down: revoke the default PUBLIC execute, then grant only the two callable
-- functions to the app roles. The internal helpers stay owner-only.
revoke execute on function public.sms_balance(uuid) from public;
revoke execute on function public.sms_metering_enforced(uuid) from public;
revoke execute on function public.sms_authorized_for(uuid, text) from public;
revoke execute on function public.sms_can_send(uuid, integer, text) from public;
revoke execute on function public.sms_record_debit(uuid, integer, text) from public;
grant execute on function public.sms_can_send(uuid, integer, text) to authenticated, service_role;
grant execute on function public.sms_record_debit(uuid, integer, text) to authenticated, service_role;
