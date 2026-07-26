-- 0076_sms_pool_ledger.sql
-- Super-admin master SMS pool (#188): the vendor's SMS balance at the gateway.
-- Gateway-balance model — buy (+) tops it up, every school send (−) draws it
-- down. Balance = SMS still available at the gateway (bought − sent). This is
-- DISPLAY only: it does not touch the send/gateway API — allocation to schools
-- is unaffected (that just grants per-school credits); the pool simply mirrors
-- real consumption so the admin sees the total dropping and re-buys.

create table public.sms_pool_ledger (
  id uuid primary key default gen_random_uuid(),
  delta integer not null,
  reason text not null check (reason in ('buy', 'send', 'adjust')),
  -- ৳ cost on a purchase; only 'buy' rows carry it, and every 'buy' row must.
  amount numeric(12, 2) check (amount is null or amount >= 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sms_pool_amount_on_buy check ((reason = 'buy') = (amount is not null))
);
create index sms_pool_ledger_created_idx on public.sms_pool_ledger (created_at);

alter table public.sms_pool_ledger enable row level security;

-- Super-admin reads the whole pool ledger.
create policy "super admin reads sms pool" on public.sms_pool_ledger
  for select using (public.app_current_role() = 'super_admin');

-- Super-admin records purchases / corrections directly (recordSmsPurchase).
-- 'send' rows are written by sms_record_debit (SECURITY DEFINER, below).
create policy "super admin writes sms pool" on public.sms_pool_ledger
  for insert with check (public.app_current_role() = 'super_admin' and reason in ('buy', 'adjust'));

-- Extend the per-school send debit (0074) to ALSO draw down the master pool, so
-- the vendor's gateway balance drops as any school sends. Runs as definer, so it
-- writes the pool row regardless of the pool insert policy above.
create or replace function public.sms_record_debit(sid uuid, segs integer, job_secret text default null)
  returns integer
  language plpgsql security definer set search_path = public as $$
begin
  if not public.sms_authorized_for(sid, job_secret) then
    raise exception 'not authorized for this school';
  end if;
  if segs > 0 then
    insert into public.sms_credit_ledger (school_id, delta, reason) values (sid, -segs, 'send');
    insert into public.sms_pool_ledger (delta, reason) values (-segs, 'send');
  end if;
  return public.sms_balance(sid);
end;
$$;
