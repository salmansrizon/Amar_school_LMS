-- Vendor revenue accrual: subscription issue is deferred, then released once
-- for the service month. School fee cash-basis postings are unchanged.

insert into public.gl_accounts (code, name, type, normal_side)
values ('2200', '{"en":"Deferred / Unearned Revenue"}', 'liability', 'credit')
on conflict (code) do nothing;

create table public.invoice_revenue_schedule (
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  period date not null,
  amount bigint not null check (amount > 0),
  released_at timestamptz,
  primary key (invoice_id, period)
);

create table public.revenue_release_runs (
  period date primary key,
  released_amount bigint not null default 0,
  released_entries integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.invoice_revenue_schedule enable row level security;
alter table public.revenue_release_runs enable row level security;

create policy "super admin reads revenue schedules" on public.invoice_revenue_schedule
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin reads revenue release runs" on public.revenue_release_runs
  for select using (public.app_current_role() = 'super_admin');

-- Reclassifies the income credit made by invoice_create. Keeping invoice_create
-- generic avoids changing school-side and other invoice callers in this slice.
create or replace function public.vendor_invoice_defer(p_invoice uuid, job_secret text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select id, school_id, income_account, subtotal_amount, number into inv
    from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if inv.subtotal_amount <= 0 then raise exception 'invoice subtotal must be positive'; end if;

  perform public.gl_post(
    'invoice-defer:' || p_invoice,
    'Defer revenue for ' || inv.number,
    jsonb_build_array(
      jsonb_build_object('account_code', inv.income_account, 'debit', inv.subtotal_amount, 'credit', 0),
      jsonb_build_object('account_code', '2200', 'debit', 0, 'credit', inv.subtotal_amount)
    ),
    inv.school_id,
    job_secret
  );
end;
$$;

create or replace function public.vendor_revenue_schedule_month(
  p_invoice uuid,
  p_period date,
  job_secret text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare amount bigint;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select subtotal_amount into amount from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice not found'; end if;
  insert into public.invoice_revenue_schedule (invoice_id, period, amount)
  values (p_invoice, date_trunc('month', p_period)::date, amount)
  on conflict (invoice_id, period) do nothing;
end;
$$;

create or replace function public.vendor_revenue_release(
  p_period date,
  job_secret text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare item record; released integer := 0; total bigint := 0; month date;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  month := date_trunc('month', p_period)::date;
  insert into public.revenue_release_runs (period) values (month)
    on conflict (period) do nothing;
  perform 1 from public.revenue_release_runs where period = month for update;

  for item in
    select s.invoice_id, s.amount, i.school_id, i.income_account, i.number
    from public.invoice_revenue_schedule s
    join public.invoices i on i.id = s.invoice_id
    where s.period = month and s.released_at is null and s.voided_at is null
    for update of s
  loop
    perform public.gl_post(
      'revenue-release:' || item.invoice_id || ':' || month,
      'Release revenue for ' || item.number || ' (' || month || ')',
      jsonb_build_array(
        jsonb_build_object('account_code', '2200', 'debit', item.amount, 'credit', 0),
        jsonb_build_object('account_code', item.income_account, 'debit', 0, 'credit', item.amount)
      ),
      item.school_id,
      job_secret
    );
    update public.invoice_revenue_schedule
      set released_at = now()
      where invoice_id = item.invoice_id and period = month;
    released := released + 1;
    total := total + item.amount;
  end loop;

  update public.revenue_release_runs
    set released_amount = released_amount + total,
        released_entries = released_entries + released
    where period = month;
  return released;
end;
$$;

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
  disc := case when p_coupon is null then 0 else coalesce((
    select case when d.discount_type = 'percent' then (sub * d.value) / 10000 else d.value end
    from public.discounts d where d.code = p_coupon and d.active
      and (d.expires_at is null or d.expires_at > now())
  ), 0) end;
  net := greatest(sub - disc, 0);

  inv := public.invoice_create(
    p_school,
    jsonb_build_array(jsonb_build_object(
      'description', 'Subscription (' || p_students || ' students' ||
        case when disc > 0 then ', coupon ' || p_coupon else '' end || ')',
      'quantity', 1, 'unit_amount', net)),
    0, '4000', null, 'Monthly subscription', job_secret);

  perform public.vendor_invoice_defer(inv, job_secret);
  perform public.vendor_revenue_schedule_month(inv, current_date, job_secret);
  if p_distributor is not null and net > 0 then
    perform public.commission_accrue(p_distributor, 'subscription', 'subscription_invoice', inv::text, net, p_year, job_secret);
  end if;
  return inv;
end;
$$;

grant execute on function public.vendor_revenue_release(date, text) to authenticated, service_role;
