-- Keep SMS package commerce atomic and retry-safe.

create table if not exists public.sms_package_purchases (
  idempotency_key text primary key check (length(idempotency_key) between 8 and 200),
  school_id uuid not null references public.schools(id),
  package_id uuid not null references public.sms_packages(id),
  invoice_id uuid unique references public.invoices(id),
  created_at timestamptz not null default now()
);

alter table public.sms_package_purchases enable row level security;

create or replace function public.sms_package_purchase(
  p_school_id uuid,
  p_package_id uuid,
  p_idempotency_key text,
  p_distributor_id uuid default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  purchase public.sms_package_purchases;
  pkg public.sms_packages;
  inv_id uuid;
  wallet_id uuid;
begin
  if not public.is_super_or_system(job_secret) then
    raise exception 'not authorized to purchase SMS packages';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'idempotency key is required';
  end if;

  insert into public.sms_package_purchases (idempotency_key, school_id, package_id)
  values (p_idempotency_key, p_school_id, p_package_id)
  on conflict (idempotency_key) do nothing;

  select * into purchase
    from public.sms_package_purchases
    where idempotency_key = p_idempotency_key
    for update;
  if purchase.school_id <> p_school_id or purchase.package_id <> p_package_id then
    raise exception 'idempotency key belongs to another purchase';
  end if;
  if purchase.invoice_id is not null then return purchase.invoice_id; end if;

  select * into pkg from public.sms_packages where id = p_package_id and active;
  if not found then raise exception 'unknown SMS package'; end if;

  inv_id := public.invoice_create(
    p_school_id,
    jsonb_build_array(jsonb_build_object(
      'description', 'SMS package: ' || coalesce(pkg.name->>'en', 'SMS'),
      'quantity', 1,
      'unit_amount', pkg.price
    )),
    0,
    '4100',
    null,
    'SMS package purchase',
    job_secret,
    null
  );

  update public.sms_package_purchases set invoice_id = inv_id where idempotency_key = p_idempotency_key;

  wallet_id := public.wallet_ensure('school_sms', p_school_id, null, job_secret);
  perform public.wallet_post(
    wallet_id,
    'sms-purchase:' || inv_id,
    'package purchase',
    null,
    pkg.segments,
    null,
    job_secret
  );

  if p_distributor_id is not null then
    perform public.commission_accrue(
      p_distributor_id,
      'sms',
      'sms_package',
      inv_id::text,
      pkg.price,
      1,
      job_secret
    );
  end if;

  return inv_id;
end;
$$;

grant execute on function public.sms_package_purchase(uuid, uuid, text, uuid, text) to authenticated, service_role;
