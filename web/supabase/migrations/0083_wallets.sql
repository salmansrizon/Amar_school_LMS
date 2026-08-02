-- 0083_wallets.sql
-- Generic wallet primitive (map #258, ticket #265; formerly #252). Operational-
-- balance backbone reused by SMS Commerce (#268) and the Financial Engine (#266).
-- Dual amount/quantity ledger (money in integer minor units = poisha; quantity
-- e.g. SMS segments), typed nullable-FK ownership (not polymorphic), append-only
-- and idempotent. Additive: the legacy sms_credit_ledger/sms_pool_ledger are
-- untouched here and retired in #268. Nothing consumes this yet.

create table public.wallet_types (
  key text primary key,
  label jsonb not null default '{}'::jsonb
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  wallet_type text not null references public.wallet_types (key),
  -- Exactly one owner dimension, or neither for the company-level wallet.
  owner_school_id uuid references public.schools (id) on delete cascade,
  owner_profile_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wallet_single_owner check (owner_school_id is null or owner_profile_id is null)
);
-- One wallet per (type, owner). Partial unique indexes cover the three owner shapes.
create unique index wallets_school_uidx on public.wallets (wallet_type, owner_school_id) where owner_school_id is not null;
create unique index wallets_profile_uidx on public.wallets (wallet_type, owner_profile_id) where owner_profile_id is not null;
create unique index wallets_company_uidx on public.wallets (wallet_type) where owner_school_id is null and owner_profile_id is null;

create table public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  amount bigint,        -- money delta in minor units (poisha); null for pure quantity moves
  quantity integer,     -- e.g. SMS segments; null for pure money moves
  route text check (route in ('mask', 'non_mask')),  -- reserved for SMS phase (#268)
  ref text not null,    -- idempotency key (unique per wallet)
  reason text not null,
  created_at timestamptz not null default now(),
  constraint wallet_entry_has_delta check (amount is not null or quantity is not null),
  unique (wallet_id, ref)
);
create index wallet_ledger_wallet_idx on public.wallet_ledger_entries (wallet_id, created_at);

alter table public.wallet_types enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger_entries enable row level security;

create policy "authenticated reads wallet_types" on public.wallet_types
  for select using (auth.uid() is not null);
create policy "super admin manages wallet_types" on public.wallet_types
  for all using (public.app_current_role() = 'super_admin');

-- Wallet visibility: super-admin all; a school reads its own; a profile owner
-- reads its own. Writes go through the definer RPCs only.
create policy "super admin reads wallets" on public.wallets
  for select using (public.app_current_role() = 'super_admin');
create policy "owner school reads wallet" on public.wallets
  for select using (owner_school_id is not null and owner_school_id = public.app_current_school_id());
create policy "owner profile reads wallet" on public.wallets
  for select using (owner_profile_id is not null and owner_profile_id = auth.uid());

create or replace function public.wallet_readable(p_wallet uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wallets w
    where w.id = p_wallet
      and (public.app_current_role() = 'super_admin'
        or (w.owner_school_id is not null and w.owner_school_id = public.app_current_school_id())
        or (w.owner_profile_id is not null and w.owner_profile_id = auth.uid()))
  );
$$;
create policy "read visible ledger" on public.wallet_ledger_entries
  for select using (public.wallet_readable(wallet_id));

insert into public.wallet_types (key, label) values
  ('company_sms',           '{"bn":"কোম্পানি এসএমএস","en":"Company SMS"}'),
  ('school_sms',            '{"bn":"স্কুল এসএমএস","en":"School SMS"}'),
  ('distributor_commission','{"bn":"ডিস্ট্রিবিউটর কমিশন","en":"Distributor Commission"}');

-- Find or create a wallet of a type for an owner (super-admin or system).
create or replace function public.wallet_ensure(
  p_wallet_type text,
  p_school_id uuid default null,
  p_profile_id uuid default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  wid uuid;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  if p_school_id is not null and p_profile_id is not null then
    raise exception 'a wallet has at most one owner';
  end if;

  select id into wid from public.wallets
    where wallet_type = p_wallet_type
      and owner_school_id is not distinct from p_school_id
      and owner_profile_id is not distinct from p_profile_id;
  if wid is not null then return wid; end if;

  insert into public.wallets (wallet_type, owner_school_id, owner_profile_id)
  values (p_wallet_type, p_school_id, p_profile_id)
  returning id into wid;
  return wid;
end;
$$;

-- Append an idempotent ledger entry (super-admin or system). Returns the
-- entry id, or the existing one when the ref was already used (no-op).
create or replace function public.wallet_post(
  p_wallet_id uuid,
  p_ref text,
  p_reason text,
  p_amount bigint default null,
  p_quantity integer default null,
  p_route text default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  if p_amount is null and p_quantity is null then
    raise exception 'entry needs an amount or a quantity';
  end if;

  insert into public.wallet_ledger_entries (wallet_id, amount, quantity, route, ref, reason)
  values (p_wallet_id, p_amount, p_quantity, p_route, p_ref, p_reason)
  on conflict (wallet_id, ref) do nothing
  returning id into eid;

  if eid is null then
    select id into eid from public.wallet_ledger_entries where wallet_id = p_wallet_id and ref = p_ref;
  end if;
  return eid;
end;
$$;

-- Current balance (money minor units + quantity) for a readable wallet.
create or replace function public.wallet_balance(p_wallet_id uuid)
  returns table (amount bigint, quantity bigint)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.wallet_readable(p_wallet_id) then
    raise exception 'not authorized for this wallet';
  end if;
  return query
    select coalesce(sum(e.amount), 0)::bigint, coalesce(sum(e.quantity), 0)::bigint
    from public.wallet_ledger_entries e where e.wallet_id = p_wallet_id;
end;
$$;
