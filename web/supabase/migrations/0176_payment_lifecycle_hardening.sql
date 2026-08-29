-- Follow-up for the provider framework already applied to the linked database.
alter table public.payment_intents add column if not exists redirect_url text;
create table if not exists public.merchant_accounts (
  id uuid primary key default gen_random_uuid(), provider text not null check (length(provider) > 0),
  legal_name text not null, status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  onboarding_reference text, settlement_currency text not null default 'BDT' check (settlement_currency = 'BDT'),
  evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (provider, legal_name)
);
alter table public.merchant_accounts enable row level security;
drop policy if exists "super admin manages merchant accounts" on public.merchant_accounts;
create policy "super admin manages merchant accounts" on public.merchant_accounts
  for all using (public.app_current_role() = 'super_admin');

drop function if exists public.payment_intent_start(uuid, text, text);
create or replace function public.payment_intent_start(
  p_intent_id uuid, p_provider_payment_id text, p_redirect_url text default null, job_secret text default null
) returns void language plpgsql security definer set search_path = public as $$
declare intent public.payment_intents;
begin
  select * into intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'payment intent not found'; end if;
  if not (public.is_super_or_system(job_secret) or exists (
    select 1 from public.invoices i where i.id = intent.invoice_id and i.school_id = public.app_current_school_id()
  )) then raise exception 'not authorized'; end if;
  if intent.status <> 'created' then
    if intent.status = 'pending' and intent.provider_payment_id = p_provider_payment_id then return; end if;
    raise exception 'payment intent is not startable (status=%)', intent.status;
  end if;
  update public.payment_intents set status = 'pending', provider_payment_id = p_provider_payment_id,
    redirect_url = p_redirect_url, updated_at = now() where id = p_intent_id;
end;
$$;

create or replace function public.payment_intent_transition(
  p_intent_id uuid, p_status text, job_secret text default null
) returns void language plpgsql security definer set search_path = public as $$
declare intent public.payment_intents;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  if p_status not in ('pending', 'failed') then raise exception 'invalid provider transition'; end if;
  select * into intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'payment intent not found'; end if;
  if intent.status = p_status then return; end if;
  if p_status = 'pending' and intent.status <> 'created' then raise exception 'invalid pending transition'; end if;
  if p_status = 'failed' and intent.status not in ('created', 'pending') then raise exception 'invalid failed transition'; end if;
  update public.payment_intents set status = p_status, updated_at = now() where id = p_intent_id;
end;
$$;
