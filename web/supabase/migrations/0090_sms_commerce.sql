-- 0090_sms_commerce.sql
-- SMS Commerce (map #258, ticket #268). Retires the legacy sms_credit_ledger
-- (0074) + sms_pool_ledger (0076) in favour of the generic wallet primitive
-- (0083): every school gets a school_sms wallet, the company a company_sms
-- wallet; a send dual-deducts both. Adds packages + per-route rate config.
--
-- DESTRUCTIVE but behavior-preserving: every historical ledger row is copied
-- into wallet_ledger_entries (date/segments/money/reason kept), the SMS RPCs are
-- repointed to wallets, then the two tables are DROPPED and re-created as
-- security_invoker VIEWS with the exact old shape, so all existing reads
-- (dashboards, history, balances) keep working. main is pre-launch (sanctioned).

-- Legacy ledgers carried a free-text note the school-detail page shows; keep it.
alter table public.wallet_ledger_entries add column if not exists note text;

create table public.sms_packages (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null default '{}'::jsonb,
  segments integer not null check (segments > 0),
  price bigint not null,               -- poisha
  active boolean not null default true
);
create table public.sms_rate_config (
  route text primary key check (route in ('mask', 'non_mask')),
  amount bigint not null               -- poisha per segment
);
alter table public.sms_packages enable row level security;
alter table public.sms_rate_config enable row level security;
create policy "authenticated reads sms_packages" on public.sms_packages
  for select using (auth.uid() is not null);
create policy "super admin manages sms_packages" on public.sms_packages
  for all using (public.app_current_role() = 'super_admin');
create policy "authenticated reads sms_rate_config" on public.sms_rate_config
  for select using (auth.uid() is not null);
create policy "super admin manages sms_rate_config" on public.sms_rate_config
  for all using (public.app_current_role() = 'super_admin');
insert into public.sms_rate_config (route, amount) values ('mask', 45), ('non_mask', 30);

-- Migrate balances: copy every ledger row into wallet entries, preserving history.
do $$
declare cwid uuid; swid uuid; r record;
begin
  -- Company (pool) wallet.
  insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
    values ('company_sms', null, null)
    on conflict do nothing;
  select id into cwid from public.wallets where wallet_type = 'company_sms' and owner_school_id is null and owner_profile_id is null;
  for r in select * from public.sms_pool_ledger loop
    insert into public.wallet_ledger_entries (wallet_id, quantity, amount, reason, note, ref, created_at)
    values (cwid, r.delta, case when r.amount is null then null else (r.amount * 100)::bigint end,
      r.reason, r.note, 'migrate:pool:' || r.id, r.created_at)
    on conflict (wallet_id, ref) do nothing;
  end loop;

  -- Per-school SMS wallets.
  for r in select distinct school_id from public.sms_credit_ledger loop
    insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
      values ('school_sms', r.school_id, null) on conflict do nothing;
  end loop;
  for r in select * from public.sms_credit_ledger loop
    select id into swid from public.wallets where wallet_type = 'school_sms' and owner_school_id = r.school_id;
    insert into public.wallet_ledger_entries (wallet_id, quantity, amount, reason, note, ref, created_at)
    values (swid, r.delta, case when r.amount is null then null else (r.amount * 100)::bigint end,
      r.reason, r.note, 'migrate:credit:' || r.id, r.created_at)
    on conflict (wallet_id, ref) do nothing;
  end loop;
end $$;

-- Repoint the SMS RPCs to wallets (same names/signatures -> call sites unchanged).
create or replace function public.sms_balance(sid uuid) returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.quantity), 0)::int
  from public.wallet_ledger_entries e
  join public.wallets w on w.id = e.wallet_id
  where w.wallet_type = 'school_sms' and w.owner_school_id = sid;
$$;

create or replace function public.sms_pool_balance() returns integer
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(e.quantity), 0)::int
  from public.wallet_ledger_entries e
  join public.wallets w on w.id = e.wallet_id
  where w.wallet_type = 'company_sms' and w.owner_school_id is null and w.owner_profile_id is null;
$$;

-- Record a send: dual-deduct school + company wallets (draws down both). Drop
-- the old 3-arg signature so the new one isn't an ambiguous PostgREST overload.
drop function if exists public.sms_record_debit(uuid, integer, text);
create or replace function public.sms_record_debit(sid uuid, segs integer, job_secret text default null, p_route text default null)
  returns integer
  language plpgsql security definer set search_path = public as $$
declare swid uuid; cwid uuid; k text;
begin
  if not public.sms_authorized_for(sid, job_secret) then raise exception 'not authorized for this school'; end if;
  if segs > 0 then
    insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
      values ('school_sms', sid, null) on conflict do nothing;
    select id into swid from public.wallets where wallet_type = 'school_sms' and owner_school_id = sid;
    insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
      values ('company_sms', null, null) on conflict do nothing;
    select id into cwid from public.wallets where wallet_type = 'company_sms' and owner_school_id is null and owner_profile_id is null;
    k := gen_random_uuid()::text;
    insert into public.wallet_ledger_entries (wallet_id, quantity, route, reason, ref)
      values (swid, -segs, p_route, 'send', 'send:' || k);
    insert into public.wallet_ledger_entries (wallet_id, quantity, route, reason, ref)
      values (cwid, -segs, p_route, 'send', 'send:' || k);
  end if;
  return public.sms_balance(sid);
end;
$$;

-- Top up a school (super/system): grant segments + record the money collected.
create or replace function public.sms_topup(sid uuid, segs integer, amount_taka numeric, note text default null, job_secret text default null)
  returns integer language plpgsql security definer set search_path = public as $$
declare swid uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
    values ('school_sms', sid, null) on conflict do nothing;
  select id into swid from public.wallets where wallet_type = 'school_sms' and owner_school_id = sid;
  insert into public.wallet_ledger_entries (wallet_id, quantity, amount, reason, note, ref)
    values (swid, segs, (amount_taka * 100)::bigint, 'topup', note, 'topup:' || gen_random_uuid()::text);
  return public.sms_balance(sid);
end;
$$;

-- Record a master-pool purchase from the gateway (super/system).
create or replace function public.sms_pool_purchase(segs integer, amount_taka numeric, note text default null, job_secret text default null)
  returns integer language plpgsql security definer set search_path = public as $$
declare cwid uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
    values ('company_sms', null, null) on conflict do nothing;
  select id into cwid from public.wallets where wallet_type = 'company_sms' and owner_school_id is null and owner_profile_id is null;
  insert into public.wallet_ledger_entries (wallet_id, quantity, amount, reason, note, ref)
    values (cwid, segs, (amount_taka * 100)::bigint, 'buy', note, 'buy:' || gen_random_uuid()::text);
  return public.sms_pool_balance();
end;
$$;

revoke execute on function public.sms_balance(uuid) from public;
revoke execute on function public.sms_pool_balance() from public;
grant execute on function public.sms_record_debit(uuid, integer, text, text) to authenticated, service_role;
grant execute on function public.sms_topup(uuid, integer, numeric, text, text) to authenticated, service_role;
grant execute on function public.sms_pool_purchase(integer, numeric, text, text) to authenticated, service_role;

-- Retire the tables, re-expose them as read-compatible security-invoker views so
-- existing reads (dashboards, history, school detail) keep working unchanged.
drop table public.sms_credit_ledger;
drop table public.sms_pool_ledger;

create view public.sms_credit_ledger
  with (security_invoker = on) as
  select e.id, w.owner_school_id as school_id, e.quantity as delta, e.reason, e.note,
    null::uuid as created_by, (case when e.amount is null then null else e.amount::numeric / 100.0 end) as amount,
    e.created_at
  from public.wallet_ledger_entries e
  join public.wallets w on w.id = e.wallet_id
  where w.wallet_type = 'school_sms';

create view public.sms_pool_ledger
  with (security_invoker = on) as
  select e.id, e.quantity as delta, e.reason, e.note,
    null::uuid as created_by, (case when e.amount is null then null else e.amount::numeric / 100.0 end) as amount,
    e.created_at
  from public.wallet_ledger_entries e
  join public.wallets w on w.id = e.wallet_id
  where w.wallet_type = 'company_sms';
