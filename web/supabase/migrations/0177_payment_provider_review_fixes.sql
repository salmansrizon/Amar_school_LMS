-- Review fixes for callback evidence and manual recovery.
alter table public.payment_provider_events add column if not exists authentication jsonb not null default '{}'::jsonb;
alter table public.payment_intents add column if not exists manual_payment_id uuid references public.payments (id);
alter table public.merchant_accounts add column if not exists tax_id text;
alter table public.merchant_accounts add column if not exists vat_id text;
alter table public.merchant_accounts add column if not exists settlement_account_ref text;
alter table public.merchant_accounts add column if not exists credential_ref text;
alter table public.merchant_accounts add column if not exists approved_by uuid;
alter table public.merchant_accounts add column if not exists approved_at timestamptz;

drop function if exists public.payment_provider_event_record(uuid, text, text, text, jsonb, text, text);
create or replace function public.payment_provider_event_record(
  p_intent_id uuid, p_provider text, p_provider_event_id text, p_event_type text,
  p_payload jsonb, p_payload_sha256 text, p_authentication jsonb, job_secret text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid; old_event public.payment_provider_events;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  if p_provider_event_id is null or p_payload_sha256 is null then raise exception 'event identity and payload hash are required'; end if;
  if coalesce((p_authentication->>'authenticated')::boolean, false) is not true
    or coalesce((p_authentication->>'provider_validated')::boolean, false) is not true then
    raise exception 'provider authentication and validation evidence are required';
  end if;
  select * into old_event from public.payment_provider_events where provider = p_provider and provider_event_id = p_provider_event_id;
  if found then
    if old_event.payload_sha256 <> p_payload_sha256 or old_event.intent_id is distinct from p_intent_id then raise exception 'provider event replay differs from the original'; end if;
    return old_event.id;
  end if;
  if p_intent_id is not null and not exists (select 1 from public.payment_intents where id = p_intent_id and provider = p_provider) then
    raise exception 'provider event intent mismatch';
  end if;
  insert into public.payment_provider_events (intent_id, provider, provider_event_id, event_type, payload, payload_sha256, authentication)
    values (p_intent_id, p_provider, p_provider_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb), p_payload_sha256, coalesce(p_authentication, '{}'::jsonb))
    returning id into event_id;
  return event_id;
end;
$$;

create or replace function public.payment_intent_manual_fallback(
  p_intent_id uuid, p_method text, p_reference text default null, job_secret text default null
) returns text language plpgsql security definer set search_path = public as $$
declare intent public.payment_intents; inv public.invoices; paid bigint; payment_id uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select * into intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'payment intent not found'; end if;
  if intent.status <> 'failed' then raise exception 'manual fallback requires failed intent'; end if;
  select * into inv from public.invoices where id = intent.invoice_id for update;
  if inv.status <> 'issued' then raise exception 'invoice is not open for payment (status=%)', inv.status; end if;
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = inv.id and status = 'confirmed';
  if intent.amount > inv.total_amount - paid then raise exception 'payment amount exceeds invoice balance'; end if;
  payment_id := public.payment_record(inv.id, intent.amount, p_method, p_reference, job_secret);
  perform public.payment_confirm(payment_id, job_secret);
  update public.payment_intents set status = 'succeeded', manual_payment_id = payment_id, succeeded_at = now(), updated_at = now()
    where id = intent.id;
  return (select status from public.invoices where id = inv.id);
end;
$$;
