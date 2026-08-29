-- Provider-neutral payment seam. No gateway is enabled by this migration.

alter table if exists public.payment_intents add column if not exists redirect_url text;

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  provider text not null check (length(provider) > 0),
  amount bigint not null check (amount > 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  idempotency_key text not null unique,
  provider_payment_id text unique,
  redirect_url text,
  status text not null default 'created'
    check (status in ('created', 'pending', 'succeeded', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz
);
create index payment_intents_invoice_idx on public.payment_intents (invoice_id, created_at desc);
create unique index payment_intents_one_open_invoice_idx on public.payment_intents (invoice_id)
  where status in ('created', 'pending');

create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid references public.payment_intents (id),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_sha256 text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index payment_provider_events_intent_idx on public.payment_provider_events (intent_id, received_at);

alter table public.payment_intents enable row level security;
alter table public.payment_provider_events enable row level security;

create policy "super admin reads payment intents" on public.payment_intents
  for select using (public.app_current_role() = 'super_admin');
create policy "school reads own payment intents" on public.payment_intents
  for select using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and i.school_id = public.app_current_school_id()
  ));
create policy "super admin reads provider events" on public.payment_provider_events
  for select using (public.app_current_role() = 'super_admin');

comment on table public.payment_intents is
  'Provider-neutral payment lifecycle. Success must flow through payment_confirm for GL posting.';
comment on table public.payment_provider_events is
  'Append-only provider notifications; payload must be redacted before storage.';

create or replace function public.payment_intent_create(
  p_invoice_id uuid,
  p_provider text,
  p_amount bigint default null,
  p_idempotency_key text default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  existing public.payment_intents;
  outstanding bigint;
  intent_id uuid;
begin
  if not (public.is_super_or_system(job_secret)
    or exists (select 1 from public.invoices i where i.id = p_invoice_id and i.school_id = public.app_current_school_id())) then
    raise exception 'not authorized for this invoice';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'idempotency key is required';
  end if;

  select * into existing from public.payment_intents where idempotency_key = p_idempotency_key;
  if found then
    if existing.invoice_id <> p_invoice_id or existing.provider <> p_provider then
      raise exception 'idempotency key belongs to another payment';
    end if;
    return existing.id;
  end if;

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if inv.status <> 'issued' then raise exception 'invoice is not open for payment (status=%)', inv.status; end if;
  select inv.total_amount - coalesce(sum(amount) filter (where status = 'confirmed'), 0)
    into outstanding from public.payments where invoice_id = inv.id;
  if coalesce(p_amount, outstanding) <= 0 or coalesce(p_amount, outstanding) > outstanding then
    raise exception 'payment amount exceeds invoice balance';
  end if;

  insert into public.payment_intents (invoice_id, provider, amount, idempotency_key)
    values (p_invoice_id, p_provider, coalesce(p_amount, outstanding), p_idempotency_key)
    returning id into intent_id;
  return intent_id;
end;
$$;

drop function if exists public.payment_intent_start(uuid, text, text);
create or replace function public.payment_intent_start(
  p_intent_id uuid, p_provider_payment_id text, p_redirect_url text default null, job_secret text default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare intent public.payment_intents;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select * into intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'payment intent not found'; end if;
  if intent.status <> 'created' then
    if intent.status = 'pending' and intent.provider_payment_id = p_provider_payment_id then return; end if;
    raise exception 'payment intent is not startable (status=%)', intent.status;
  end if;
  update public.payment_intents
    set status = 'pending', provider_payment_id = p_provider_payment_id, redirect_url = p_redirect_url, updated_at = now()
    where id = p_intent_id;
end;
$$;

create or replace function public.payment_provider_event_record(
  p_intent_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_sha256 text,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare event_id uuid; old_event public.payment_provider_events;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  if p_provider_event_id is null or p_payload_sha256 is null then raise exception 'event identity and payload hash are required'; end if;
  select * into old_event from public.payment_provider_events
    where provider = p_provider and provider_event_id = p_provider_event_id;
  if found then
    if old_event.payload_sha256 <> p_payload_sha256 or old_event.intent_id is distinct from p_intent_id then
      raise exception 'provider event replay differs from the original';
    end if;
    return old_event.id;
  end if;
  if p_intent_id is not null and not exists (
    select 1 from public.payment_intents where id = p_intent_id and provider = p_provider
  ) then raise exception 'provider event intent mismatch'; end if;
  insert into public.payment_provider_events (intent_id, provider, provider_event_id, event_type, payload, payload_sha256)
    values (p_intent_id, p_provider, p_provider_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb), p_payload_sha256)
    returning id into event_id;
  return event_id;
end;
$$;

create or replace function public.payment_intent_succeed(
  p_intent_id uuid, p_provider_payment_id text, p_amount bigint, job_secret text default null
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  intent public.payment_intents;
  inv public.invoices;
  paid bigint;
  payment_id uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select * into intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'payment intent not found'; end if;
  if intent.status = 'succeeded' then return 'paid'; end if;
  if intent.status not in ('created', 'pending') then raise exception 'payment intent is not payable (status=%)', intent.status; end if;
  if intent.provider_payment_id is not null and intent.provider_payment_id <> p_provider_payment_id then
    raise exception 'provider payment ID mismatch';
  end if;
  if p_amount <> intent.amount then raise exception 'provider amount mismatch'; end if;

  select * into inv from public.invoices where id = intent.invoice_id for update;
  if inv.status <> 'issued' then raise exception 'invoice is not open for payment (status=%)', inv.status; end if;
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = inv.id and status = 'confirmed';
  if p_amount > inv.total_amount - paid then raise exception 'payment amount exceeds invoice balance'; end if;

  payment_id := public.payment_record(inv.id, p_amount, intent.provider, p_provider_payment_id, job_secret);
  perform public.payment_confirm(payment_id, job_secret);
  update public.payment_intents set status = 'succeeded', provider_payment_id = p_provider_payment_id,
    succeeded_at = now(), updated_at = now() where id = intent.id;
  return (select status from public.invoices where id = inv.id);
end;
$$;

create or replace function public.payment_provider_event_mark_processed(
  p_event_id uuid, job_secret text default null
) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  update public.payment_provider_events set processed_at = now() where id = p_event_id;
  if not found then raise exception 'provider event not found'; end if;
end;
$$;
