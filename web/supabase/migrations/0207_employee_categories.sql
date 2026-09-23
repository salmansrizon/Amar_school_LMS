-- 0207_employee_categories.sql
-- Employee Category foundation (issue #666, ADR 0028): a real database
-- integrity anchor for the fixed, global, code-owned Employee Category
-- vocabulary (EMPLOYEE_CATEGORIES, web/lib/employees.ts) that
-- employees.category, category_grace_minutes.category, and
-- category_office_hours.employee_category all already key off by exact
-- string match with no DB-level integrity today -- category_grace_minutes in
-- particular had no application validation either.
--
-- Global reference data, same shape as locations/clusters (migration 0003):
-- any signed-in role may read, only Super Admin writes. No school_id column
-- -- this is not per-school customizable data.
--
-- The three existing columns stay `text` (ADR 0028): they get a foreign key
-- against employee_categories.name (a unique, non-primary-key column) rather
-- than being converted to a category_id uuid column, since every read site
-- (Employees, Office Hour, Category Grace, SMS recipient filters,
-- satisfaction-rating breakdowns) already works by name and EMPLOYEE_CATEGORIES
-- stays the live application source for dropdowns/validation.

create table public.employee_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.employee_categories enable row level security;

create policy "authenticated read employee_categories" on public.employee_categories
  for select to authenticated using (true);
create policy "super admin manages employee_categories" on public.employee_categories
  for all using (public.app_current_role() = 'super_admin');

comment on table public.employee_categories is
  'Fixed, global Employee Category vocabulary (issue #666, ADR 0028) -- the '
  'database integrity anchor for employees.category/category_grace_minutes.category/'
  'category_office_hours.employee_category, all FK''d to this table''s `name`. '
  'Not per-school and not read by the application for its dropdowns: '
  'EMPLOYEE_CATEGORIES (web/lib/employees.ts) remains the live source for those.';

-- Seed the 20 canonical values -- verified against EMPLOYEE_CATEGORIES
-- (web/lib/employees.ts) at the time this migration was written.
insert into public.employee_categories (name) values
  ('Teacher'),
  ('Office Staff'),
  ('Management'),
  ('Security'),
  ('Head Teacher'),
  ('Principal'),
  ('Vice Principal'),
  ('Registrar'),
  ('Office Clerk'),
  ('Accountant'),
  ('Professor'),
  ('Lecturer'),
  ('Librarian'),
  ('Nurse'),
  ('Medical Staff'),
  ('IT Technician'),
  ('Janitor'),
  ('Cleaner'),
  ('Security Guard'),
  ('Transport Staff')
on conflict (name) do nothing;

-- Auto-include any legacy value already live in the three consumer columns
-- (e.g. lowercase strays like "admin"/"staff"/"teacher" predating issue #567's
-- fixed list) so the FK constraints below can never fail and never require
-- touching a single existing row's value.
insert into public.employee_categories (name)
select distinct category from public.employees
where category is not null
on conflict (name) do nothing;

insert into public.employee_categories (name)
select distinct category from public.category_grace_minutes
on conflict (name) do nothing;

insert into public.employee_categories (name)
select distinct employee_category from public.category_office_hours
on conflict (name) do nothing;

alter table public.employees
  add constraint employees_category_fkey
  foreign key (category) references public.employee_categories (name);

alter table public.category_grace_minutes
  add constraint category_grace_minutes_category_fkey
  foreign key (category) references public.employee_categories (name);

-- category_office_hours already CHECK-constrained employee_category to the
-- exact fixed list inline (migration 0205) -- replaced by the FK below so the
-- vocabulary lives in exactly one place instead of two copies to keep in sync.
alter table public.category_office_hours
  drop constraint if exists category_office_hours_employee_category_check;

alter table public.category_office_hours
  add constraint category_office_hours_employee_category_fkey
  foreign key (employee_category) references public.employee_categories (name);
