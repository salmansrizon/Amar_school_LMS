-- 0072_central_off_days.sql
-- Central off-day calendar (map #158, ticket #166): the super-admin authors a
-- yearly holiday template that any school can import into its own off_days
-- (0021). Super-admin manages the template; every authenticated user may read it
-- (schools need to read it to import).

create table public.central_off_days (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  label_bn text,
  label_en text,
  year int generated always as (extract(year from day)::int) stored,
  created_at timestamptz not null default now()
);

create index central_off_days_year_idx on public.central_off_days (year);

alter table public.central_off_days enable row level security;

create policy "super admin manages central off days" on public.central_off_days
  for all using (public.app_current_role() = 'super_admin');
create policy "authenticated reads central off days" on public.central_off_days
  for select using (auth.uid() is not null);
