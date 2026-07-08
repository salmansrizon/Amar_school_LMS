-- Subscription Codes (issue #5) + manual expiry correction (issue #6).
-- Rules per CONTEXT.md: stacking onto max(today, expiry); Trial = zero code
-- history; price-0 codes are real codes; used codes cannot be deleted.

alter table public.schools add column subscription_expires_at date;

create table public.subscription_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  validity_months int not null check (validity_months between 1 and 24),
  price numeric(10, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  redeemed_school_id uuid references public.schools (id),
  redeemed_at timestamptz,
  constraint redeemed_pair check ((redeemed_school_id is null) = (redeemed_at is null))
);

create index subscription_codes_school_idx on public.subscription_codes (redeemed_school_id);

alter table public.subscription_codes enable row level security;

create policy "super admin reads codes" on public.subscription_codes
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin inserts codes" on public.subscription_codes
  for insert with check (public.app_current_role() = 'super_admin');
create policy "super admin updates codes" on public.subscription_codes
  for update using (public.app_current_role() = 'super_admin');
-- Used codes cannot be deleted — the delete policy simply never matches them.
create policy "super admin deletes unused codes" on public.subscription_codes
  for delete using (public.app_current_role() = 'super_admin' and redeemed_at is null);

create function public.generate_code_batch(
  batch_count int,
  validity_months int,
  code_price numeric
) returns setof public.subscription_codes
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can generate codes';
  end if;
  if batch_count not between 1 and 50 then
    raise exception 'batch size must be between 1 and 50';
  end if;
  if validity_months not between 1 and 24 then
    raise exception 'validity must be between 1 and 24 months';
  end if;
  if code_price < 0 then
    raise exception 'price cannot be negative';
  end if;

  return query
  insert into subscription_codes (code, validity_months, price)
  select upper(encode(extensions.gen_random_bytes(6), 'hex')),
         generate_code_batch.validity_months, code_price
  from generate_series(1, batch_count)
  returning *;
end $$;

create function public.redeem_code(code_text text, sid uuid) returns date
language plpgsql security definer set search_path = public as $$
declare
  c subscription_codes%rowtype;
  current_expiry date;
  new_expiry date;
begin
  if not (
    public.app_current_role() = 'super_admin'
    or (public.app_current_role() = 'school_owner' and public.app_current_school_id() = sid)
  ) then
    raise exception 'not allowed to redeem for this School';
  end if;

  select * into c from subscription_codes where code = upper(code_text) for update;
  if not found then
    raise exception 'invalid code';
  end if;
  if c.redeemed_at is not null then
    raise exception 'code already used';
  end if;

  select subscription_expires_at into current_expiry from schools where id = sid for update;
  if not found then
    raise exception 'unknown school';
  end if;

  -- Stack onto max(today, current expiry): active schools extend; lapsed
  -- schools start fresh from the redemption date (CONTEXT.md).
  new_expiry := greatest(current_date, coalesce(current_expiry, current_date))
                + make_interval(months => c.validity_months);

  update schools set subscription_expires_at = new_expiry where id = sid;
  update subscription_codes set redeemed_school_id = sid, redeemed_at = now() where id = c.id;
  return new_expiry;
end $$;

create function public.school_subscription_status(sid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  has_history boolean;
  expiry date;
begin
  if not (
    public.app_current_role() = 'super_admin'
    or public.app_current_school_id() = sid
    or public.school_reachable_by_me(sid)
  ) then
    raise exception 'not allowed';
  end if;

  select exists (select 1 from subscription_codes where redeemed_school_id = sid) into has_history;
  if not has_history then
    return 'trial';
  end if;
  select subscription_expires_at into expiry from schools where id = sid;
  if expiry is not null and expiry >= current_date then
    return 'active';
  end if;
  return 'expired';
end $$;

-- Manual correction (issue #6): only meaningful for a School with a real,
-- currently-active expiry. Trial → error (nothing to decrease); already
-- expired → no-op.
create function public.decrease_expiry(sid uuid, months int) returns date
language plpgsql security definer set search_path = public as $$
declare
  expiry date;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can correct expiry dates';
  end if;
  if months < 1 then
    raise exception 'months must be at least 1';
  end if;
  if not exists (select 1 from subscription_codes where redeemed_school_id = sid) then
    raise exception 'not available for a Trial School (no code history)';
  end if;

  select subscription_expires_at into expiry from schools where id = sid for update;
  if expiry is null or expiry < current_date then
    return expiry; -- already expired: no observable effect
  end if;

  expiry := expiry - make_interval(months => months);
  update schools set subscription_expires_at = expiry where id = sid;
  return expiry;
end $$;

revoke execute on function public.generate_code_batch(int, int, numeric) from anon, public;
revoke execute on function public.redeem_code(text, uuid) from anon, public;
revoke execute on function public.school_subscription_status(uuid) from anon, public;
revoke execute on function public.decrease_expiry(uuid, int) from anon, public;
grant execute on function public.generate_code_batch(int, int, numeric) to authenticated;
grant execute on function public.redeem_code(text, uuid) to authenticated;
grant execute on function public.school_subscription_status(uuid) to authenticated;
grant execute on function public.decrease_expiry(uuid, int) to authenticated;
