-- 0087_commission_settlement.sql
-- Financial Engine part C (map #258, #266): configurable commission accrual,
-- distributor settlement, and a general discount primitive. Commissions credit
-- the distributor's commission wallet (0083) AND post to the GL (0085);
-- settlement pays them out. All config-driven, amounts in minor units.

create table public.commission_rules (
  key text primary key,
  stream text not null check (stream in ('subscription', 'sms', 'implementation')),
  rule_type text not null check (rule_type in ('percent', 'flat')),
  -- percent in basis points (3000 = 30%); flat in minor units.
  rate bigint not null,
  active boolean not null default true
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  stream text not null,
  source_type text not null,
  source_id text not null,
  base_amount bigint not null,
  commission_amount bigint not null,
  status text not null default 'accrued' check (status in ('accrued', 'settled')),
  settlement_id uuid,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, distributor_id)
);
create index commissions_distributor_idx on public.commissions (distributor_id, status);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_amount bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.discounts (
  code text primary key,
  scope text not null default 'subscription',
  discount_type text not null check (discount_type in ('percent', 'flat')),
  value bigint not null,
  active boolean not null default true,
  expires_at timestamptz
);

alter table public.commission_rules enable row level security;
alter table public.commissions enable row level security;
alter table public.settlements enable row level security;
alter table public.discounts enable row level security;

create policy "authenticated reads commission_rules" on public.commission_rules
  for select using (auth.uid() is not null);
create policy "super admin manages commission_rules" on public.commission_rules
  for all using (public.app_current_role() = 'super_admin');
create policy "authenticated reads discounts" on public.discounts
  for select using (auth.uid() is not null);
create policy "super admin manages discounts" on public.discounts
  for all using (public.app_current_role() = 'super_admin');

-- Commissions/settlements: super-admin all; the distributor reads its own.
create policy "super admin reads commissions" on public.commissions
  for select using (public.app_current_role() = 'super_admin');
create policy "distributor reads own commissions" on public.commissions
  for select using (distributor_id = auth.uid());
create policy "super admin reads settlements" on public.settlements
  for select using (public.app_current_role() = 'super_admin');
create policy "distributor reads own settlements" on public.settlements
  for select using (distributor_id = auth.uid());

insert into public.commission_rules (key, stream, rule_type, rate) values
  ('subscription_y1', 'subscription', 'percent', 3000),  -- 30%
  ('sms_flat',        'sms',          'flat',    0);

-- Accrue a commission for a distributor: compute from the active rule, record it,
-- credit the commission wallet, and post to the GL. Idempotent per source.
create or replace function public.commission_accrue(
  p_distributor uuid,
  p_stream text,
  p_source_type text,
  p_source_id text,
  p_base_amount bigint,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  r public.commission_rules;
  amt bigint;
  c_id uuid;
  wid uuid;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized to accrue commission';
  end if;
  select * into r from public.commission_rules where stream = p_stream and active order by key limit 1;
  if not found then raise exception 'no active commission rule for stream %', p_stream; end if;
  amt := case when r.rule_type = 'percent' then (p_base_amount * r.rate) / 10000 else r.rate end;

  insert into public.commissions (distributor_id, stream, source_type, source_id, base_amount, commission_amount)
  values (p_distributor, p_stream, p_source_type, p_source_id, p_base_amount, amt)
  on conflict (source_type, source_id, distributor_id) do nothing
  returning id into c_id;
  if c_id is null then
    select id into c_id from public.commissions
      where source_type = p_source_type and source_id = p_source_id and distributor_id = p_distributor;
    return c_id;  -- already accrued
  end if;

  wid := public.wallet_ensure('distributor_commission', null, p_distributor, job_secret);
  perform public.wallet_post(wid, 'commission:' || c_id, 'commission accrual', amt, null, null, job_secret);
  perform public.gl_post('commission:' || c_id, 'Commission ' || p_stream,
    jsonb_build_array(
      jsonb_build_object('account_code', '5000', 'debit', amt, 'credit', 0),
      jsonb_build_object('account_code', '2100', 'debit', 0, 'credit', amt)
    ), null, job_secret);
  perform public.publish_domain_event('CommissionCalculated', null,
    jsonb_build_object('commissionId', c_id, 'distributor', p_distributor, 'amount', amt), null, job_secret);
  perform public.record_audit('commission', c_id::text, 'create', null, null, null,
    jsonb_build_object('amount', amt, 'stream', p_stream), null, null, null, job_secret);
  return c_id;
end;
$$;

-- Bundle a distributor's accrued commissions in a period into a settlement (draft).
create or replace function public.settlement_run(
  p_distributor uuid, p_period_start date, p_period_end date, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare s_id uuid; total bigint;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  select coalesce(sum(commission_amount), 0) into total from public.commissions
    where distributor_id = p_distributor and status = 'accrued'
      and created_at::date between p_period_start and p_period_end;

  insert into public.settlements (distributor_id, period_start, period_end, total_amount)
  values (p_distributor, p_period_start, p_period_end, total) returning id into s_id;

  update public.commissions set settlement_id = s_id
    where distributor_id = p_distributor and status = 'accrued'
      and created_at::date between p_period_start and p_period_end;
  return s_id;
end;
$$;

-- Approve + pay a settlement: mark its commissions settled, post payout to GL,
-- emit SettlementCompleted.
create or replace function public.settlement_approve(p_settlement uuid, job_secret text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare s public.settlements;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  select * into s from public.settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if s.status <> 'draft' then raise exception 'settlement is not draft'; end if;

  update public.settlements set status = 'paid', approved_by = auth.uid(), approved_at = now()
    where id = p_settlement;
  update public.commissions set status = 'settled' where settlement_id = p_settlement;

  if s.total_amount > 0 then
    perform public.gl_post('settlement:' || p_settlement, 'Distributor settlement',
      jsonb_build_array(
        jsonb_build_object('account_code', '2100', 'debit', s.total_amount, 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', s.total_amount)
      ), null, job_secret);
  end if;
  perform public.publish_domain_event('SettlementCompleted', null,
    jsonb_build_object('settlementId', p_settlement, 'distributor', s.distributor_id, 'amount', s.total_amount), null, job_secret);
  perform public.record_audit('settlement', p_settlement::text, 'approve', null, null, null,
    jsonb_build_object('amount', s.total_amount), null, null, null, job_secret);
end;
$$;

-- General discount resolver: computed reduction for a base amount, or 0 if the
-- code is missing/inactive/expired.
create or replace function public.discount_resolve(p_code text, p_base_amount bigint)
  returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when d.discount_type = 'percent' then (p_base_amount * d.value) / 10000 else d.value end
    from public.discounts d
    where d.code = p_code and d.active and (d.expires_at is null or d.expires_at > now())
  ), 0);
$$;
