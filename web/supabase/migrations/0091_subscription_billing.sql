-- 0091_subscription_billing.sql
-- Subscription pricing + billing (map #258, ticket #269). Configurable base +
-- per-student pricing feeding the Financial Engine (invoice on subscription
-- income) with coupon discount + distributor commission. Additive: the existing
-- code-redemption flow (0008 redeem_code, 0069 reminders) is untouched; this is
-- the new configurable recurring-billing path.

create table public.subscription_pricing (
  singleton boolean primary key default true check (singleton),
  base_fee bigint not null,          -- poisha / month
  per_student_fee bigint not null    -- poisha / active student / month
);
alter table public.subscription_pricing enable row level security;
create policy "authenticated reads subscription_pricing" on public.subscription_pricing
  for select using (auth.uid() is not null);
create policy "super admin manages subscription_pricing" on public.subscription_pricing
  for all using (public.app_current_role() = 'super_admin');
-- Seed: 2,000 BDT base + 7 BDT/active student (config, per master_prd.md).
insert into public.subscription_pricing (singleton, base_fee, per_student_fee) values (true, 200000, 700);

-- UI-facing quote: subtotal / discount / total for a student count + optional
-- coupon. Any signed-in user may preview.
create or replace function public.subscription_quote(p_students integer, p_coupon text default null)
  returns table (subtotal bigint, discount bigint, total bigint)
  language plpgsql stable security definer set search_path = public as $$
declare bf bigint; psf bigint; sub bigint; disc bigint;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select base_fee, per_student_fee into bf, psf from public.subscription_pricing where singleton;
  sub := bf + psf * greatest(p_students, 0);
  disc := case when p_coupon is null then 0
    else coalesce((
      select case when d.discount_type = 'percent' then (sub * d.value) / 10000 else d.value end
      from public.discounts d
      where d.code = p_coupon and d.active and (d.expires_at is null or d.expires_at > now())
    ), 0) end;
  return query select sub, disc, greatest(sub - disc, 0);
end;
$$;

-- Issue a subscription invoice (super/system): compute net of coupon, bill to
-- subscription income, accrue distributor commission by renewal year.
create or replace function public.subscription_bill(
  p_school uuid, p_students integer, p_year integer default 1,
  p_coupon text default null, p_distributor uuid default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare bf bigint; psf bigint; sub bigint; disc bigint; net bigint; inv uuid;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to bill'; end if;
  select base_fee, per_student_fee into bf, psf from public.subscription_pricing where singleton;
  sub := bf + psf * greatest(p_students, 0);
  disc := case when p_coupon is null then 0
    else coalesce((
      select case when d.discount_type = 'percent' then (sub * d.value) / 10000 else d.value end
      from public.discounts d
      where d.code = p_coupon and d.active and (d.expires_at is null or d.expires_at > now())
    ), 0) end;
  net := greatest(sub - disc, 0);

  inv := public.invoice_create(
    p_school,
    jsonb_build_array(jsonb_build_object(
      'description', 'Subscription (' || p_students || ' students' ||
        case when disc > 0 then ', coupon ' || p_coupon else '' end || ')',
      'quantity', 1, 'unit_amount', net)),
    0, '4000', null, 'Monthly subscription', job_secret);

  if p_distributor is not null and net > 0 then
    perform public.commission_accrue(p_distributor, 'subscription', 'subscription_invoice', inv::text, net, p_year, job_secret);
  end if;
  return inv;
end;
$$;
