-- 0088_financial_review_fixes.sql
-- Two-axis review follow-up for the Financial Engine (#266). Fixes real money
-- bugs + closes spec gaps; no user-facing behavior change (nothing consumes
-- these yet).
--   BUG (high): settlement_run re-bundled already-settled commissions -> double
--     payout. Now only picks unsettled (settlement_id is null) accrued rows.
--   BUG (med): payment_confirm accepted payments against void/paid invoices and
--     over-collection. Now requires the invoice to be 'issued'.
--   GAP: tax_config table (spec deliverable) + tax_resolve.
--   GAP: commission "year-1 higher, decays on renewal" now expressible via
--     min_year/max_year tiers; commission_accrue takes p_year.
--   GAP: payment_record now audited; discount_resolve now self-gates.
--   DRY: extract is_super_or_system() (the check recurred 6x).

create or replace function public.is_super_or_system(job_secret text)
  returns boolean language sql stable security definer set search_path = public as $$
  select public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret);
$$;

-- Tax configuration (default 0%). Applied to subscription invoices in #269.
create table public.tax_config (
  key text primary key,
  label jsonb not null default '{}'::jsonb,
  rate_bp integer not null default 0,   -- basis points
  active boolean not null default true
);
alter table public.tax_config enable row level security;
create policy "authenticated reads tax_config" on public.tax_config
  for select using (auth.uid() is not null);
create policy "super admin manages tax_config" on public.tax_config
  for all using (public.app_current_role() = 'super_admin');
insert into public.tax_config (key, label, rate_bp) values
  ('vat', '{"en":"VAT"}', 0),
  ('withholding', '{"en":"Withholding Tax"}', 0);

create or replace function public.tax_resolve(p_base_amount bigint)
  returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum((p_base_amount * rate_bp) / 10000), 0)::bigint
  from public.tax_config where active;
$$;

-- Commission tiers by renewal year (year-1 higher, later years decay).
alter table public.commission_rules add column if not exists min_year integer not null default 1;
alter table public.commission_rules add column if not exists max_year integer;
update public.commission_rules set max_year = 1 where key = 'subscription_y1';
insert into public.commission_rules (key, stream, rule_type, rate, min_year, max_year)
  values ('subscription_renewal', 'subscription', 'percent', 2000, 2, null)
  on conflict (key) do nothing;

-- gl_post: use the shared authz helper (behavior identical).
create or replace function public.gl_post(
  p_ref text, p_memo text, p_lines jsonb, p_school_id uuid default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare entry_id uuid; total_debit bigint; total_credit bigint; ln jsonb;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to post to the ledger'; end if;
  select id into entry_id from public.gl_entries where ref = p_ref;
  if entry_id is not null then return entry_id; end if;
  select coalesce(sum((l->>'debit')::bigint), 0), coalesce(sum((l->>'credit')::bigint), 0)
    into total_debit, total_credit from jsonb_array_elements(p_lines) l;
  if total_debit <> total_credit or total_debit = 0 then
    raise exception 'unbalanced or empty journal entry (debit=%, credit=%)', total_debit, total_credit;
  end if;
  insert into public.gl_entries (ref, memo, school_id) values (p_ref, p_memo, p_school_id) returning id into entry_id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.gl_lines (entry_id, account_code, debit, credit)
    values (entry_id, ln->>'account_code', coalesce((ln->>'debit')::bigint, 0), coalesce((ln->>'credit')::bigint, 0));
  end loop;
  perform public.record_audit('gl_entry', entry_id::text, 'create', p_school_id, null, null,
    jsonb_build_object('ref', p_ref, 'debit', total_debit), null, null, null, job_secret);
  return entry_id;
end;
$$;

-- payment_record: helper authz + audit the pending payment.
create or replace function public.payment_record(
  p_invoice_id uuid, p_amount bigint, p_method text, p_reference text default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare inv public.invoices; pay_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if not (public.app_tenant_member(inv.school_id) or public.is_system_caller(job_secret)) then
    raise exception 'not authorized for this invoice';
  end if;
  insert into public.payments (invoice_id, amount, method, reference)
  values (p_invoice_id, p_amount, p_method, p_reference) returning id into pay_id;
  perform public.record_audit('payment', pay_id::text, 'create', inv.school_id, null, null,
    jsonb_build_object('amount', p_amount, 'method', p_method), null, null, null, job_secret);
  return pay_id;
end;
$$;

-- payment_confirm: guard invoice status (must be 'issued') — no paying void/paid,
-- no silent over-collection past the point the invoice is settled.
create or replace function public.payment_confirm(p_payment_id uuid, job_secret text default null)
  returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments; inv public.invoices; confirmed_total bigint; new_status text;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to confirm payments'; end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;
  if pay.status <> 'pending' then raise exception 'payment is not pending'; end if;
  select * into inv from public.invoices where id = pay.invoice_id;
  if inv.status <> 'issued' then raise exception 'invoice is not open for payment (status=%)', inv.status; end if;

  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment_id;
  perform public.gl_post('payment:' || p_payment_id, 'Payment for ' || inv.number,
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'debit', pay.amount, 'credit', 0),
      jsonb_build_object('account_code', '1100', 'debit', 0, 'credit', pay.amount)
    ), inv.school_id, job_secret);
  select coalesce(sum(amount), 0) into confirmed_total from public.payments where invoice_id = inv.id and status = 'confirmed';
  if confirmed_total >= inv.total_amount then
    update public.invoices set status = 'paid' where id = inv.id;
    new_status := 'paid';
    perform public.publish_domain_event('InvoicePaid', inv.school_id,
      jsonb_build_object('invoiceId', inv.id, 'number', inv.number, 'total', inv.total_amount), null, null);
  else
    new_status := inv.status;
  end if;
  perform public.record_audit('payment', p_payment_id::text, 'approve', inv.school_id, null, null,
    jsonb_build_object('amount', pay.amount, 'invoiceStatus', new_status), null, null, null, job_secret);
  return new_status;
end;
$$;

-- commission_accrue: add p_year tier selection (drop old signature first to avoid
-- a PostgREST overload). Uses the shared authz helper.
drop function if exists public.commission_accrue(uuid, text, text, text, bigint, text);
create or replace function public.commission_accrue(
  p_distributor uuid, p_stream text, p_source_type text, p_source_id text,
  p_base_amount bigint, p_year integer default 1, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare r public.commission_rules; amt bigint; c_id uuid; wid uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to accrue commission'; end if;
  select * into r from public.commission_rules
    where stream = p_stream and active
      and p_year >= min_year and (max_year is null or p_year <= max_year)
    order by min_year desc limit 1;
  if not found then raise exception 'no active commission rule for stream % year %', p_stream, p_year; end if;
  amt := case when r.rule_type = 'percent' then (p_base_amount * r.rate) / 10000 else r.rate end;

  insert into public.commissions (distributor_id, stream, source_type, source_id, base_amount, commission_amount)
  values (p_distributor, p_stream, p_source_type, p_source_id, p_base_amount, amt)
  on conflict (source_type, source_id, distributor_id) do nothing returning id into c_id;
  if c_id is null then
    select id into c_id from public.commissions
      where source_type = p_source_type and source_id = p_source_id and distributor_id = p_distributor;
    return c_id;
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
    jsonb_build_object('amount', amt, 'stream', p_stream, 'year', p_year), null, null, null, job_secret);
  return c_id;
end;
$$;

-- settlement_run: only bundle UNSETTLED accrued commissions (fixes double payout).
create or replace function public.settlement_run(
  p_distributor uuid, p_period_start date, p_period_end date, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare s_id uuid; total bigint;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select coalesce(sum(commission_amount), 0) into total from public.commissions
    where distributor_id = p_distributor and status = 'accrued' and settlement_id is null
      and created_at::date between p_period_start and p_period_end;
  insert into public.settlements (distributor_id, period_start, period_end, total_amount)
  values (p_distributor, p_period_start, p_period_end, total) returning id into s_id;
  update public.commissions set settlement_id = s_id
    where distributor_id = p_distributor and status = 'accrued' and settlement_id is null
      and created_at::date between p_period_start and p_period_end;
  return s_id;
end;
$$;

-- settlement_approve: shared authz helper (behavior identical).
create or replace function public.settlement_approve(p_settlement uuid, job_secret text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare s public.settlements;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select * into s from public.settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if s.status <> 'draft' then raise exception 'settlement is not draft'; end if;
  update public.settlements set status = 'paid', approved_by = auth.uid(), approved_at = now() where id = p_settlement;
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

-- invoice_create: shared authz helper (behavior identical).
create or replace function public.invoice_create(
  p_school_id uuid, p_lines jsonb, p_tax_amount bigint default 0, p_income_account text default '4000',
  p_due_at timestamptz default null, p_memo text default '', job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare inv_id uuid; inv_number text; subtotal bigint; total bigint; ln jsonb; gl_lines jsonb;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to issue invoices'; end if;
  select coalesce(sum((l->>'quantity')::bigint * (l->>'unit_amount')::bigint), 0)
    into subtotal from jsonb_array_elements(p_lines) l;
  if subtotal <= 0 then raise exception 'invoice must have a positive subtotal'; end if;
  total := subtotal + coalesce(p_tax_amount, 0);
  inv_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  insert into public.invoices (number, school_id, income_account, subtotal_amount, tax_amount, total_amount, memo, due_at)
  values (inv_number, p_school_id, p_income_account, subtotal, coalesce(p_tax_amount, 0), total, p_memo, p_due_at)
  returning id into inv_id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines (invoice_id, description, quantity, unit_amount, amount)
    values (inv_id, ln->>'description', coalesce((ln->>'quantity')::bigint, 1), (ln->>'unit_amount')::bigint,
      coalesce((ln->>'quantity')::bigint, 1) * (ln->>'unit_amount')::bigint);
  end loop;
  gl_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1100', 'debit', total, 'credit', 0),
    jsonb_build_object('account_code', p_income_account, 'debit', 0, 'credit', subtotal));
  if coalesce(p_tax_amount, 0) > 0 then
    gl_lines := gl_lines || jsonb_build_array(jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', p_tax_amount));
  end if;
  perform public.gl_post('invoice:' || inv_id, 'Invoice ' || inv_number, gl_lines, p_school_id, job_secret);
  perform public.publish_domain_event('InvoiceGenerated', p_school_id,
    jsonb_build_object('invoiceId', inv_id, 'number', inv_number, 'total', total), null, null);
  perform public.record_audit('invoice', inv_id::text, 'create', p_school_id, null, null,
    jsonb_build_object('number', inv_number, 'total', total), null, null, null, job_secret);
  return inv_id;
end;
$$;

-- discount_resolve: self-gate (signed-in) for convention consistency.
create or replace function public.discount_resolve(p_code text, p_base_amount bigint)
  returns bigint language plpgsql stable security definer set search_path = public as $$
declare v bigint;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select case when d.discount_type = 'percent' then (p_base_amount * d.value) / 10000 else d.value end
    into v from public.discounts d
    where d.code = p_code and d.active and (d.expires_at is null or d.expires_at > now());
  return coalesce(v, 0);
end;
$$;
