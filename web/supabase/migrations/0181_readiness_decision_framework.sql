-- Evidence-safe readiness framework. No unresolved tax or tender assumption is
-- executable by default.

create table public.tax_treatment_config (
  id uuid primary key default gen_random_uuid(),
  supply_type text not null check (supply_type in ('subscription', 'sms', 'implementation', 'collection')),
  customer_type text not null default 'school',
  status text not null default 'pending' check (status in ('pending', 'approved', 'retired')),
  rate_bp integer not null default 0 check (rate_bp >= 0),
  inclusive boolean not null default false,
  exemption_reason text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (supply_type, customer_type, effective_from)
);

alter table public.tax_treatment_config enable row level security;
create policy "authenticated reads tax treatments" on public.tax_treatment_config
  for select using (auth.uid() is not null);
create policy "super admin manages tax treatments" on public.tax_treatment_config
  for all using (public.app_current_role() = 'super_admin');

insert into public.tax_treatment_config (supply_type)
values ('subscription'), ('sms'), ('implementation'), ('collection');

create or replace function public.tax_treatment_resolve(
  p_supply_type text,
  p_customer_type text default 'school',
  p_effective_date date default current_date
) returns table(status text, rate_bp integer, inclusive boolean, source_reference text)
language sql stable security definer set search_path = public as $$
  select t.status, t.rate_bp, t.inclusive, t.source_reference
  from public.tax_treatment_config t
  where t.supply_type = p_supply_type
    and t.customer_type = p_customer_type
    and (t.effective_from is null or t.effective_from <= p_effective_date)
    and (t.effective_to is null or t.effective_to >= p_effective_date)
    and t.status <> 'retired'
  order by t.effective_from desc nulls last
  limit 1
$$;

-- An adjustment is a pending immutable document until an approved legal model
-- and refund/reconciliation workflow exists. It never edits its invoice.
create table public.invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  original_invoice_id uuid not null references public.invoices (id) on delete restrict,
  kind text not null check (kind in ('refund', 'credit_note', 'debit_note', 'reversal')),
  amount bigint not null check (amount > 0),
  taxable_amount bigint not null default 0 check (taxable_amount >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'posted')),
  reason text not null,
  source_reference text,
  provider_refund_id text,
  reconciliation_status text not null default 'unreconciled'
    check (reconciliation_status in ('unreconciled', 'reconciled')),
  created_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invoice_adjustments enable row level security;
create policy "super admin reads invoice adjustments" on public.invoice_adjustments
  for select using (public.app_current_role() = 'super_admin');
create policy "school reads own invoice adjustments" on public.invoice_adjustments
  for select using (exists (
    select 1 from public.invoices i
    where i.id = original_invoice_id and i.school_id = public.app_current_school_id()
  ));

create or replace function public.invoice_adjustment_create(
  p_invoice uuid,
  p_kind text,
  p_amount bigint,
  p_reason text,
  p_source_reference text default null,
  job_secret text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare adjustment_id uuid; school uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select school_id into school from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice not found'; end if;
  if p_kind not in ('refund', 'credit_note', 'debit_note', 'reversal') then
    raise exception 'unsupported adjustment kind';
  end if;
  if p_amount <= 0 or coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'adjustment amount and reason are required';
  end if;
  insert into public.invoice_adjustments
    (original_invoice_id, kind, amount, reason, source_reference, created_by)
  values (p_invoice, p_kind, p_amount, p_reason, p_source_reference, auth.uid())
  returning id into adjustment_id;
  perform public.record_audit('invoice_adjustment', adjustment_id::text, 'create', school,
    null, null, jsonb_build_object('invoice_id', p_invoice, 'kind', p_kind, 'amount', p_amount),
    null, null, null, job_secret);
  return adjustment_id;
end;
$$;

create table public.government_tender_profiles (
  id uuid primary key default gen_random_uuid(),
  procuring_entity text not null,
  tender_reference text not null,
  document_version text,
  document_date date,
  submission_deadline timestamptz,
  status text not null default 'blocked' check (status in ('blocked', 'draft', 'approved', 'expired')),
  created_at timestamptz not null default now(),
  unique (procuring_entity, tender_reference)
);

create table public.government_tender_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.government_tender_profiles (id) on delete cascade,
  evidence_area text not null,
  buyer_requirement text,
  amar_evidence text,
  accountable_owner text,
  status text not null default 'blocked' check (status in ('blocked', 'baseline', 'ready', 'approved')),
  created_at timestamptz not null default now(),
  unique (profile_id, evidence_area)
);

alter table public.government_tender_profiles enable row level security;
alter table public.government_tender_evidence enable row level security;
create policy "super admin reads tender profiles" on public.government_tender_profiles
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin manages tender profiles" on public.government_tender_profiles
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin reads tender evidence" on public.government_tender_evidence
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin manages tender evidence" on public.government_tender_evidence
  for all using (public.app_current_role() = 'super_admin');

grant execute on function public.tax_treatment_resolve(text, text, date) to authenticated, service_role;
grant execute on function public.invoice_adjustment_create(uuid, text, bigint, text, text, text) to authenticated, service_role;
