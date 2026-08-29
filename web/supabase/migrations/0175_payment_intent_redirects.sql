-- Follow-up for the already-applied provider framework migration.
alter table public.payment_intents add column if not exists redirect_url text;

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
