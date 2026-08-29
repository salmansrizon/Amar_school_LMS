-- Store launch and legal decisions without pretending missing evidence exists.

create table public.vendor_legal_profile (
  singleton boolean primary key default true check (singleton),
  legal_entity_name text,
  tin text,
  bin text,
  registered_address text,
  adviser_evidence text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'approved')),
  effective_from date,
  updated_at timestamptz not null default now()
);
insert into public.vendor_legal_profile (singleton, status) values (true, 'pending');

create table public.launch_package_config (
  singleton boolean primary key default true check (singleton),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'retired')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  pricing_model text not null default 'hybrid' check (pricing_model in ('school', 'student', 'hybrid')),
  payment_mode text not null default 'manual' check (payment_mode in ('manual', 'provider')),
  languages text[] not null default array['bn', 'en'],
  support_channel text,
  support_response_hours integer check (support_response_hours is null or support_response_hours > 0),
  included_modules text[] not null,
  deferred_capabilities text[] not null,
  updated_at timestamptz not null default now()
);
insert into public.launch_package_config (
  singleton, included_modules, deferred_capabilities, support_response_hours
) values (
  true,
  array['students', 'employees', 'classes', 'attendance', 'exams', 'fees', 'notices', 'questions', 'institute', 'sms', 'reports', 'student-portal', 'manual-payments', 'audit', 'print'],
  array['gateway', 'vat', 'tender', 'residency', 'training', 'warranty', 'certification'],
  24
);

alter table public.vendor_legal_profile enable row level security;
alter table public.launch_package_config enable row level security;
create policy "super admin reads legal profile" on public.vendor_legal_profile
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin manages legal profile" on public.vendor_legal_profile
  for all using (public.app_current_role() = 'super_admin');
create policy "super admin reads launch package" on public.launch_package_config
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin manages launch package" on public.launch_package_config
  for all using (public.app_current_role() = 'super_admin');
