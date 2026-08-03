-- 0104_subscription_billing_sweep.sql
-- Recurring subscription billing (master_prd.md doc 003): a monthly Vercel cron
-- (/api/subscription/billing-sweep) calls this to bill every school once per
-- period (dedup via subscription_billing_runs), priced by active student count.
create table public.subscription_billing_runs (
  school_id uuid not null references public.schools (id) on delete cascade,
  period text not null,
  invoice_id uuid references public.invoices (id),
  created_at timestamptz not null default now(),
  primary key (school_id, period)
);
alter table public.subscription_billing_runs enable row level security;
create policy "super admin reads billing runs" on public.subscription_billing_runs
  for select using (public.app_current_role() = 'super_admin');
create policy "school reads own billing runs" on public.subscription_billing_runs
  for select using (school_id = public.app_current_school_id());

create or replace function public.subscription_billing_sweep(job_secret text, p_period text)
  returns integer language plpgsql security definer set search_path = public as $$
declare s record; cnt integer; inv uuid; billed integer := 0;
begin
  if not public.is_system_caller(job_secret) then raise exception 'not authorized'; end if;
  for s in select id from public.schools loop
    if exists (select 1 from public.subscription_billing_runs where school_id = s.id and period = p_period) then
      continue;
    end if;
    select count(*) into cnt from public.students where school_id = s.id;
    inv := public.subscription_bill(s.id, cnt, 1, null, null, job_secret);
    insert into public.subscription_billing_runs (school_id, period, invoice_id) values (s.id, p_period, inv);
    billed := billed + 1;
  end loop;
  return billed;
end;
$$;
