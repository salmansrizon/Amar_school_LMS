-- 0205_category_office_hours.sql
-- Office Hour (issue #643, ADR 0026): a published, Employee-Category-wide
-- expected time window per Shift and Day of week -- a School-wide schedule,
-- not an individual attendance input. Deliberately NOT an extension of
-- `office_times` (per-individual-Employee attendance-grace window, see ADR
-- 0026) -- the two tables share no foreign key and never will.
--
-- `shift` is nullable and CHECK-constrained to the same four static values as
-- `schools.configured_shifts` (migration 0176), mirroring `class_offerings.shift`
-- for a No-Shift School. `employee_category` is CHECK-constrained to the exact
-- fixed list in web/lib/employees.ts's EMPLOYEE_CATEGORIES -- a brand-new table
-- has no legacy rows to tolerate outside that list, unlike `employees.category`.
--
-- Uniqueness uses `unique nulls not distinct`, the same technique
-- `class_offerings_identity_unique` (migration 0190) uses, so a No-Shift
-- School's rows still collide correctly on (school_id, employee_category,
-- day_of_week) alone with shift left null.

create table public.category_office_hours (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  shift text
    check (shift is null or shift = any (array['Morning', 'Day', 'Evening', 'Night'])),
  employee_category text not null
    check (employee_category = any (array[
      'Teacher', 'Office Staff', 'Management', 'Security', 'Head Teacher', 'Principal',
      'Vice Principal', 'Registrar', 'Office Clerk', 'Accountant', 'Professor', 'Lecturer',
      'Librarian', 'Nurse', 'Medical Staff', 'IT Technician', 'Janitor', 'Cleaner',
      'Security Guard', 'Transport Staff'
    ])),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sunday..6=Saturday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_office_hours_time_order check (end_time > start_time),
  constraint category_office_hours_identity_unique
    unique nulls not distinct (school_id, shift, employee_category, day_of_week)
);

create index category_office_hours_school_idx on public.category_office_hours (school_id);

alter table public.category_office_hours enable row level security;

create policy "school members manage category_office_hours"
  on public.category_office_hours
  for all using (school_id = public.app_current_school_id());

create policy "super admin manages category_office_hours"
  on public.category_office_hours
  for all using (public.app_current_role() = 'super_admin');

comment on table public.category_office_hours is
  'Office Hour (issue #643): a published Employee-Category x Shift x Day-of-week '
  'expected time window, configured under Institute Setup. Not an attendance '
  'input and unrelated to office_times/employee_office_times -- see ADR 0026.';
