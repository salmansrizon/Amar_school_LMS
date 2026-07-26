-- 0076_sms_pool_ledger.sql
-- Super-admin master SMS pool (#188): the vendor's own SMS balance bought from
-- the gateway. Reserve model — buy (+), allocate to a school (−). Balance =
-- unallocated SMS. Super-admin only. The send path is untouched (allocation
-- already removed the credits from the pool; the per-school ledger in 0074
-- handles consumption).

create table public.sms_pool_ledger (
  id uuid primary key default gen_random_uuid(),
  delta integer not null,
  reason text not null check (reason in ('buy', 'allocate', 'adjust')),
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
-- Allocations go through the atomic RPC below, not a direct insert.
create policy "super admin writes sms pool" on public.sms_pool_ledger
  for insert with check (public.app_current_role() = 'super_admin');

-- Allocate to a school atomically: the per-school credit row AND the pool
-- draw-down in ONE transaction, so the two ledgers can never drift (a
-- fire-and-forget second insert could leave the pool overstated). Returns the
-- new pool balance so the caller can warn when it has gone negative.
create or replace function public.sms_allocate_to_school(
  p_school uuid, p_credits integer, p_amount numeric, p_note text
) returns integer
  language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  if public.app_current_role() <> 'super_admin' then raise exception 'not authorized'; end if;
  if p_credits is null or p_credits <= 0 then raise exception 'credits must be positive'; end if;

  insert into public.sms_credit_ledger (school_id, delta, reason, amount, note, created_by)
    values (p_school, p_credits, 'topup', p_amount, p_note, auth.uid());
  insert into public.sms_pool_ledger (delta, reason, note, created_by)
    values (-p_credits, 'allocate', p_note, auth.uid());

  select coalesce(sum(delta), 0) into new_balance from public.sms_pool_ledger;
  return new_balance;
end;
$$;
revoke execute on function public.sms_allocate_to_school(uuid, integer, numeric, text) from public;
grant execute on function public.sms_allocate_to_school(uuid, integer, numeric, text) to authenticated;
